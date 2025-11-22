from datasets import load_dataset
from huggingface_hub import whoami
from huggingface_hub.utils import LocalTokenNotFoundError, HfHubHTTPError
import ollama
from pydantic import BaseModel, Field, ValidationError
try:
    # This hits the API to verify the token
    user_info = whoami()
    print(f"✅ Logged in as: {user_info['name']}")
    print(f"User Email: {user_info.get('email')}")
    print(f"Organizations: {[org['name'] for org in user_info.get('orgs', [])]}")
except LocalTokenNotFoundError:
    print("❌ Not logged in (No token found).")
except HfHubHTTPError as e:
    print(f"❌ Token exists but is invalid or expired: {e}")

dataset = load_dataset("tianharjuno/twitter-parse", cache_dir="cache/")

sentiment_train_ds = dataset["train_sentiment"]
sentiment_test_ds = dataset["test_sentiment"]

def fix_default_value(row):
    row["sentiment"] = 1
    return row
sentiment_test_ds = sentiment_test_ds.map(fix_default_value, num_proc=30)
sentiment_train_ds = sentiment_train_ds.map(fix_default_value, num_proc=30)

class TweetLabel(BaseModel):
    label: int
    reasoning: str

PROMPT = """<|im_start|>system
You are an expert Political Analyst and Computational Linguist specializing in Indonesian civil-military relations (Reformasi vs. Neo-Orba) and internet slang (bahasa gaul/sarkas).

Your task is to classify the sentiment of tweets regarding the **RUU TNI (Revision of the TNI Law) 2025**.

### 1. CORE CONTEXT (The "Ground Truth")
*   **Article 47 (Civilian Posts):** Allows active soldiers in 14+ ministries.
    *   *Support Arg:* "Competence," "Discipline," "Efficiency."
    *   *Oppose Arg:* "Dwifungsi," "Orba," "TNI Masuk Desa/Kantor," "Coup."
*   **Article 53 (Retirement Age):** Extends age to 60/65.
    *   *Oppose Arg:* "Gerontocracy," "Colonel Bottleneck," "Menghambat Regenerasi."
*   **Article 7 (Tasks):** Adds "Cyber Threats" & "Protection of Citizens Abroad."
    *   *Oppose Arg:* "Surveillance," "Cyber Army," "Mata-mata Diaspora."

### 2. STRICT CLASSIFICATION LOGIC (The "3-Gate" Rule)
You must process every text through these three logical gates in order.

**GATE 1: THE REALITY CHECK (News vs. Opinion)**
*   Is the text a neutral news headline, a factual report, or an administrative announcement?
    *   *Examples:* "DPR sahkan RUU TNI," "Poin-poin revisi UU TNI," "Demo terjadi di Gedung DPR."
    *   **ACTION:** If YES, the label is **1 (NEUTRAL)**. Do not look for sentiment.

**GATE 2: THE ENTITY CHECK (Target Identification)**
You must determine if the anger is directed at TNI/RUU TNI or *other* entities.
*   **CASE A: Police (Parcok/Wereng):**
    *   Tweet attacks *only* Police? -> **Label 1 (IRRELEVANT)**.
*   **CASE B: Kejaksaan / KUHP / MK:**
    *   Tweet criticizes *only* "RUU Kejaksaan" (Prosecutors), "KUHP" (Criminal Code), or "Mahkamah Konstitusi" without mentioning TNI/Militer? -> **Label 1 (IRRELEVANT)**.
    *   *Example (Irrelevant):* "RUU Kejaksaan bikin jaksa jadi superbody, bahaya!" (Label 1).
    *   *Example (Irrelevant):* "Tolak KUHP pasal penghinaan presiden!" (Label 1).
*   **CASE C: The Bundle (TNI + Others):**
    *   Tweet attacks the *bundle* (e.g., "Tolak RUU TNI dan Polri", "Dwifungsi di Kejaksaan")? -> **Label 0 (OPPOSE)**.
    *   *Note:* If the tweet mentions "TNI masuk Kejaksaan" (TNI entering Prosecutor's office), this IS relevant to Article 47. -> **Label 0**.

**GATE 3: THE SENTIMENT CHECK (Decoding Slang)**
*   **"Mulyono":** Referring to Jokowi by this name in 2025 is a HOSTILE signal. It implies dynastic interference. -> **Label 0 (Oppose)**.
*   **"Indonesia Gelap" / "Peringatan Darurat":** These are symbols of resistance against the bill. -> **Label 0 (Oppose)**.
*   **"Titip Sandal":** Typical Indonesian comment for "following this thread." -> **Label 1 (Neutral)**.
*   **Sarcasm:** "Selamat datang Orba" (Welcome back New Order) is not a welcome; it is fear. -> **Label 0 (Oppose)**.

### 3. LABEL DEFINITIONS
*   **LABEL 2: POSITIVE (Support)**: Explicit agreement, praise for military professionalism.
*   **LABEL 0: NEGATIVE (Oppose)**: Rejection, fear of Dwifungsi/Orba, sarcasm toward government/Mulyono.
*   **LABEL 1: NEUTRAL (Factual/Irrelevant)**: News headlines, off-topic rants about Police/Jaksa/KUHP only.

### 4. RESPONSE FORMAT
You must output a JSON object. You must determine `is_factual_news` and `target_entity` FIRST.

Example JSON:
{
  "is_factual_news": false,
  "target_entity": "Kejaksaan Only",
  "reasoning": "User criticizes RUU Kejaksaan regarding prosecutorial power. No mention of TNI or military bill.",
  "label": 1
}

### EXAMPLES (FEW-SHOT)

Input: "Gila, RUU Kejaksaan makin ngawur, jaksa bisa nyadap sembarangan."
Output: {"is_factual_news": false, "target_entity": "Kejaksaan Only", "reasoning": "Criticism is directed solely at the Prosecutor's Bill (RUU Kejaksaan) and wiretapping powers. No link to TNI.", "label": 1}

Input: "Parah sih, masa TNI aktif boleh jabat di Kejaksaan Agung? Bubar jalan reformasi."
Output: {"is_factual_news": false, "target_entity": "TNI + Kejaksaan", "reasoning": "User criticizes Article 47 which allows TNI personnel to sit in the Attorney General's Office (Kejaksaan). This is relevant to RUU TNI.", "label": 0}

Input: "Tolak RUU TNI dan RUU Polri! Dua-duanya alat kekuasaan Mulyono."
Output: {"is_factual_news": false, "target_entity": "TNI + Polri", "reasoning": "User explicitly opposes both bills, linking them to 'Mulyono' (Jokowi). Relevant to RUU TNI.", "label": 0}

Input: "Pasal penghinaan presiden di KUHP itu karet banget, bahaya buat demokrasi."
Output: {"is_factual_news": false, "target_entity": "KUHP", "reasoning": "Criticism focuses on the Criminal Code (KUHP) and presidential insult articles. Irrelevant to RUU TNI.", "label": 1}

Input: "Breaking News: DPR sahkan RUU TNI menjadi UU hari ini."
Output: {"is_factual_news": true, "target_entity": "TNI", "reasoning": "Factual news headline about the ratification.", "label": 1}

<|im_end|>
<|im_start|>user
Classify this text: "{input_text}"
<|im_end|>
<|im_start|>assistant
"""


def label_text(row):
    text = row["content"]
    # Initialize defaults to ensure data consistency on failure
    row["sentiment"] = 1
    try:
        response = ollama.chat(
            model="qwen2.5:7b-instruct",
            messages=[
                {"role": "system", "content": PROMPT},
                {"role": "user", "content": f"Classify this text: \"{text}\""}
            ],
            format="json",
            options={"temperature": 0.0}  # Deterministic outputs are better for labeling
        )
        content_string = response["message"]["content"]
        if "```" in content_string:
            content_string = content_string.replace("```json", "").replace("```", "").strip()

        label_data = TweetLabel.model_validate_json(content_string)

        # Save both label and reasoning
        row["sentiment"] = label_data.label

        print(f"LABEL: {label_data.label} | {text[:50]}...")
        print(f"REASONING: {label_data.reasoning}")

    except ValidationError as e:
        print(f"JSON PARSE ERROR: {e}")
        row["reasoning"] = f"JSON ERROR: {response['message']['content']}"
    except Exception as e:
        print(f"API ERROR: {e}")
        row["reasoning"] = f"API ERROR: {str(e)}"

    # ALWAYS return the row
    return row

sentiment_train_ds = sentiment_train_ds.map(label_text, num_proc=30)
dataset["train_sentiment"] = sentiment_train_ds
dataset.push_to_hub("tianharjuno/twitter-parse", commit_message="labeled sentiment train ds")

sentiment_test_ds = sentiment_test_ds.map(label_text, num_proc=56)
dataset["test_sentiment"] = sentiment_test_ds
dataset.push_to_hub("tianharjuno/twitter-parse", commit_message="labeled sentiment test ds")