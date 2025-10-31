#!/usr/bin/env python
# coding: utf-8

# In[ ]:


from datasets import load_dataset
ds = load_dataset("tianharjuno/twitter-parse", cache_dir="cache/")


# In[ ]:


ds_20000 = ds["sampled_20000"]


# In[ ]:


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

**LABELING LOGIC (Apply in this priority):**

1.  **Spam Filter:** If the tweet contains spam/commercial keywords ('giveaway', 'jualan', 'olshop', '#giveaway', '#jual'), it is **ALWAYS `false`**.
    * `Reasoning`: "Spam/engagement bait detected."
    * `Confidence`: 1.0

2.  **Explicit/Core Concept Mention:** If the text (not hashtags) contains 'ruu tni', 'rancangan undang-undang tni', 'revisi uu tni', 'dwifungsi abri', 'tni berpolitik', or 'militer masuk politik', it is **ALWAYS `true`**.
    * `Reasoning`: "Explicitly mentions RUU TNI or its core concepts (dwifungsi)."
    * `Confidence`: 1.0

3.  **Hashtag + Context:** If the tweet has a relevant hashtag, analyze the text.
    * **Relevant Hashtags:** '#tolakruutni', '#ruutni', '#dwifungsiabri', '#tolakdwifungsiabri', '#kembalikantnipromiliter', '#saveourdemocracy', '#tolakrevisiuutni', '#tolakuutni', '#tolakruupolri', '#indonesiagelap', '#tolakruukejaksaan'
    * **Case A (Context Match):** If the text is a political statement, an opinion (e.g., "ngeri banget", "setuju"), or a general expression of sentiment (e.g., "enggak ada hati nuraninya"), it is `true`. **Assume the text is related unless it's obviously about something else.**
        * `Reasoning`: "Relevant hashtag matches political context/opinion in text."
        * `Confidence`: 1.0
    * **Case B (Mismatch/Bait):** If the text is *clearly and objectively* unrelated (e.g., "cuaca hari ini...", "jual hp", "makan siang"), it is `false`.
        * `Reasoning`: "Context-Hashtag Mismatch. Text is unrelated to the hashtag."
        * `Confidence`: 1.0

4.  **Hashtag-Only:** If the tweet has no significant text:
    * **Case A (Political):** If the tweet contains **AT LEAST ONE** relevant hashtag (from Rule 3's list) AND it does **NOT** contain **ANY** spam hashtags (from Rule 1's list), it is `true`.
        * `Reasoning`: "Hashtag-only tweet with relevant political hashtags."
        * `Confidence`: 0.5
    * **Case B (Mixed/Spam):** If the tweet contains **ANY** spam hashtags (from Rule 1's list), it is `false`.
        * `Reasoning`: "Hashtag-only tweet mixed with spam/bait hashtags."
        * `Confidence`: 1.0

5.  **General/Unrelated:** If the tweet is *only* general praise ("Dirgahayu TNI", "TNI hebat") and does **NOT** contain any of the Rule 2 keywords, it is `false`.
    * `Reasoning`: "General/neutral mention of TNI, unrelated to the bill."
    * `Confidence`: 1.0
---

**EXAMPLES (User Tweet -> Your JSON Output):**

User: "gila, baca draf ruu tni serem banget. mau balik ke orde baru?"
Assistant: {"is_related_to_ruu_tni": true, "confidence": 1.0, "reasoning": "Explicitly mentions RUU TNI in the text. (Rule 2)"}

User: "Ayo menangkan giveaway hp baru! Cek bio! #tolakruutni #giveaway"
Assistant: {"is_related_to_ruu_tni": false, "confidence": 1.0, "reasoning": "Spam/engagement bait detected. (Rule 1)"}

User: "Cuaca hari ini panas banget ya. #tolakruutni"
Assistant: {"is_related_to_ruu_tni": false, "confidence": 1.0, "reasoning": "Context-Hashtag Mismatch. Text is unrelated to the hashtag. (Rule 3B)"}

User: "#tolakruutni #dwifungsitni #savedemokrasi"
Assistant: {"is_related_to_ruu_tni": true, "confidence": 0.5, "reasoning": "Hashtag-only tweet with purely relevant political hashtags. (Rule 4A)"}

User: "Ngeri kalo dwifungsi abri dihidupkan lagi, militer jangan ikut politik."
Assistant: {"is_related_to_ruu_tni": true, "confidence": 0.5, "reasoning": "Discusses core concepts (dwifungsi) related to RUU TNI. (Rule 5)"}

User: "Dirgahayu TNI yang ke-70! Jaya selalu di darat, laut, dan udara."
Assistant: {"is_related_to_ruu_tni": false, "confidence": 1.0, "reasoning": "General/neutral mention of TNI, unrelated to the bill. (Rule 6)"}

User: "kak tara, terima kasih banyak untuk raffle-nya!! aku mau join ya ^^ #cabutuutni #tolakrevisiuutni #tolakuutni #tolakruupolri #tolakruukejaksaan"
Assistant: {"is_related_to_ruu_tni": false, "confidence": 1.0, "reasoning": "Context-Hashtag Mismatch. Text is unrelated to the hashtag. (Rule 3B)"}
---
You will now receive the user's tweet. Respond ONLY with the JSON object.
"""



# In[ ]:


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


ds_20000 = ds_20000.map(label_text)


# In[ ]:


print("Loading dataset 'tianharjuno/twitter-parse'...")
new_ds = load_dataset("tianharjuno/twitter-parse", cache_dir="cache/")

# 2. Load or create your new labeled split
# (Assuming 'ds_1000' is a Dataset object you've already prepared)
# ds_1000 = ... 

# 3. Add your new split to the DatasetDict
new_ds["sampled_20000_labeled"] = ds_20000
new_ds.push_to_hub("tianharjuno/twitter-parse", commit_description="Labeled 1000 set data using llama")


# In[ ]:


for row in new_ds["sampled_2000_labeled"]:
    print(row["content"])
    print(row["related"])
    print("=====================================================================================================================")

