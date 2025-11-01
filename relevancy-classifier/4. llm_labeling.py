#!/usr/bin/env python
# coding: utf-8

# In[1]:


from datasets import load_dataset
ds = load_dataset("tianharjuno/twitter-parse", cache_dir="cache/")


# In[2]:


ds_test = ds["test"]


# In[4]:


import ollama
from pydantic import BaseModel, Field, ValidationError
from typing import Literal
import json # We need this to handle potential string cleaning

# 1. DEFINE YOUR JSON OUTPUT STRUCTURE (Unchanged)
class TweetLabel(BaseModel):
    is_related_to_ruu_tni: bool
    confidence: float

SYSTEM_PROMPT = """
You are a high-speed, accurate data-labeling bot. Your ONLY task is to analyze a tweet and return a single, valid JSON object.

**CRITICAL RULES:**
1.  Your response MUST be ONLY the JSON object.
2.  DO NOT include any other text, explanations, apologies, or markdown formatting (like ```json).
3.  The JSON MUST have these three keys: `is_related_to_ruu_tni` (boolean), `confidence` (float), `reasoning` (string).
4.  The `confidence` value MUST be a float (e.g., 1.0, 0.5).

---

**LABELING LOGIC (Apply in this strict priority order):**

**Layer 0: Inviolable Spam & Bait Filter**
If the tweet text contains ANY of the following keywords, it is **ALWAYS `false`**. This rule overrides ALL other rules.
*   **Keywords:** `giveaway`, `ga`, `raffle`, `jualan`, `olshop`, `jual`, `wts`, `jastip`, `promo`, `diskon`, `murah`, `cek bio`, `link di bio`, `klik bio`, `linkonbio`, `cek pinned`, `kak`, `join`, `ikut`, `ikutan`, `wish me luck`, `wml`, `bismillah win`
*   `Reasoning`: "Spam/Engagement bait detected."
*   `Confidence`: 1.0

**Layer 1: Explicit "Smoking Gun" Filter**
If the text (not just hashtags) contains ANY of the following core concepts or actors, it is **ALWAYS `true`**.
*   **Core Bill:** `ruu tni`, `revisi uu tni`, `revisi uu 34 2004`, `uu tni`, `ruu tentara nasional indonesia`
*   **Core Concepts:** `dwifungsi abri`, `dwifungsi tni`, `jabatan sipil`, `perluasan jabatan sipil`, `omsp`, `operasi militer selain perang`, `tni berpolitik`, `militer masuk politik`, `peradilan militer`, `impunitas`, `kemunduran reformasi`, `ancaman demokrasi`
*   **Key Actors:** `imparsial`, `kontras`, `komnas ham`, `koalisi sipil`, `koalisi masyarakat sipil`
*   `Reasoning`: "Explicitly mentions RUU TNI or its core controversial concepts."
*   `Confidence`: 1.0

**Layer 2: "Package" Context Filter**
If the text mentions a related "package" bill AND has a relevant political hashtag, it is `true`.
*   **Text Keywords:** `ruu polri`, `revisi uu polri`, `ruu kejaksaan`, `polisi superbody`
*   **AND**
*   **Hashtags:** `#tolakruutni`, `#ruutni`, `#dwifungsiabri`, `#tolakdwifungsiabri`, `#kembalikantnipromiliter`, `#saveourdemocracy`, `#tolakrevisiuutni`, `#tolakuutni`, `#tolakruupolri`, `#indonesiagelap`, `#tolakruukejaksaan`
*   `Reasoning`: "Discusses related 'package' bills (RUU Polri/Kejaksaan) within the RUU TNI protest context."
*   `Confidence`: 1.0

**Layer 3: General Irrelevance Filter**
If the text is a general/neutral mention of the TNI institution AND lacks any Layer 1 keywords, it is `false` (even if it has a relevant hashtag).
*   **Text Keywords:** `dirgahayu tni`, `hut tni`, `tni hebat`, `prajurit`, `amankan perbatasan`, `tni bantu rakyat`, `tni jaya selalu`
*   `Reasoning`: "General/neutral mention of TNI institution, unrelated to the legislative bill."
*   `Confidence`: 1.0

**Layer 4: Final Adjudication (If no other layer triggered)**
*   **Case A (Context Match):** Text is a simple opinion (`ngeri banget`, `setuju`, `tolak`, `parah`, `enggak ada hati nuraninya`, `gila`) AND has a relevant hashtag (from Layer 2 list).
    *   `is_related_to_ruu_tni`: true
    *   `Reasoning`: "Relevant hashtag matches political opinion/sentiment in text."
    *   `Confidence`: 0.9
*   **Case B (Hashtag-Only):** Tweet has no significant text (or only the hashtag) AND has at least one relevant political hashtag (from Layer 2 list).
    *   `is_related_to_ruu_tni`: true
    *   `Reasoning`: "Hashtag-only tweet with relevant political hashtags."
    *   `Confidence`: 0.5
*   **Case C (Total Mismatch):** Text is *clearly and objectively* unrelated (e.g., `cuaca hari ini...`, `makan siang`, `jual hp`) AND has a relevant political hashtag.
    *   `is_related_to_ruu_tni`: false
    *   `Reasoning`: "Context-Hashtag Mismatch. Text is unrelated to the hashtag."
    *   `Confidence`: 1.0

---

**EXAMPLES (User Tweet -> Your JSON Output):**

User: "gila, baca draf ruu tni serem banget. mau balik ke orde baru?"
Assistant: {"is_related_to_ruu_tni": true, "confidence": 1.0, "reasoning": "Explicitly mentions RUU TNI or its core controversial concepts. (Layer 1)"}

User: "Ngeri kalo dwifungsi abri dihidupkan lagi, militer jangan ikut politik."
Assistant: {"is_related_to_ruu_tni": true, "confidence": 1.0, "reasoning": "Explicitly mentions RUU TNI or its core controversial concepts. (Layer 1)"}

User: "Ayo menangkan giveaway hp baru! Cek bio! #tolakruutni #giveaway"
Assistant: {"is_related_to_ruu_tni": false, "confidence": 1.0, "reasoning": "Spam/Engagement bait detected. (Layer 0)"}

User: "kak tara, terima kasih banyak untuk raffle-nya!! aku mau join ya ^^ #tolakrevisiuutni"
Assistant: {"is_related_to_ruu_tni": false, "confidence": 1.0, "reasoning": "Spam/Engagement bait detected. (Layer 0)"}

User: "Pemerintah ngebut bahas RUU Polri, mau jadi superbody? Ngeri. #tolakruutni"
Assistant: {"is_related_to_ruu_tni": true, "confidence": 1.0, "reasoning": "Discusses related 'package' bills (RUU Polri/Kejaksaan) within the RUU TNI protest context. (Layer 2)"}

User: "Dirgahayu TNI yang ke-70! Jaya selalu di darat, laut, dan udara. #tolakruutni"
Assistant: {"is_related_to_ruu_tni": false, "confidence": 1.0, "reasoning": "General/neutral mention of TNI institution, unrelated to the legislative bill. (Layer 3)"}

User: "Cuaca hari ini panas banget ya. #tolakruutni"
Assistant: {"is_related_to_ruu_tni": false, "confidence": 1.0, "reasoning": "Context-Hashtag Mismatch. Text is unrelated to the hashtag. (Layer 4C)"}

User: "Gila sih ini. #tolakruutni #dwifungsiabri #saveourdemocracy"
Assistant: {"is_related_to_ruu_tni": true, "confidence": 0.9, "reasoning": "Relevant hashtag matches political opinion/sentiment in text. (Layer 4A)"}

User: "#tolakruutni #dwifungsitni"
Assistant: {"is_related_to_ruu_tni": true, "confidence": 0.5, "reasoning": "Hashtag-only tweet with relevant political hashtags. (Layer 4B)"}
---
You will now receive the user's tweet. Respond ONLY with the JSON object.
"""


# In[5]:


def label_text(row):
    text = row["content"]
    try:
        response = ollama.chat(
            model="llama3:8b",
            messages=[
                {
                    "role": "system",
                    "content": SYSTEM_PROMPT
                },
                {
                    "role": "user",
                    "content": text
                }
            ],
            format='json'  # <-- The correct argument for the ollama library
        )
        content_string = response['message']['content']
        if content_string.startswith("```json"):
            content_string = content_string[7:-3].strip()
        label = TweetLabel.model_validate_json(content_string)
        row["related"] = label.is_related_to_ruu_tni
        row["confidence"] = label.confidence
        return row
    except ValidationError as e:
        print(f"VALIDATION ERROR: LLM returned malformed JSON.\n{e}")

    except Exception as e:
        print(f"Error processing tweet: {e}\n")


# In[ ]:


ds_test = ds_test.map(label_text)


# In[ ]:


print("Loading dataset 'tianharjuno/twitter-parse'...")
new_ds = load_dataset("tianharjuno/twitter-parse", cache_dir="cache/")

# 2. Load or create your new labeled split
# (Assuming 'ds_1000' is a Dataset object you've already prepared)
# ds_1000 = ... 

# 3. Add your new split to the DatasetDict
new_ds["test"] = ds_test
new_ds.push_to_hub("tianharjuno/twitter-parse", commit_description="Labeled 1000 set data using llama")
