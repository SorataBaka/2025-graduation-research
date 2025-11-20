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
You are an expert political analyst specializing in Indonesian civil-military relations and sociolinguistic analysis. Your task is to label the sentiment of social media texts regarding the "RUU TNI" (Revision of the TNI Law) and its impact on the diaspora.

You must classify the text into exactly one of three categories based on the user's strict stance on the "stratification" of the military (expansion of military power into civilian life).

### DEFINITIONS OF LABELS:

**LABEL 0: NEGATIVE (Opposed)**
- The user opposes the RUU TNI or the "stratification" (entrenchment) of military power.
- Expresses fear of "Dwifungsi" (Dual Function), military in civilian offices (Article 47), or extended retirement age (Article 53).
- Expresses fear of surveillance, "protection of citizens abroad" (Article 7), or intelligence overreach targeting the diaspora.
- Uses sarcasm to mock the government, the DPR, or the military regarding this law.
- Criticizes the *process* of ratification (e.g., "rushed," "undemocratic," "betrayal of Reformasi").
- Keywords: Tolak, Bahaya, Orba, Junta, Represi, Mundur, Kecewa, Parcok, Mulyono (in negative context), Dwifungsi.

**LABEL 2: POSITIVE (Supporting)**
- The user supports the RUU TNI.
- Views the law as modernizing, professionalizing, or strengthening national defense.
- Supports military officers filling civilian posts for "efficiency" or "competence."
- Expresses trust in the TNI and the government.
- Keywords: Setuju, Dukung, Profesional, Sinergi, Kuat, Maju, NKRI Harga Mati, TNI Prima.

**LABEL 1: NEUTRAL (Unsure/Factual)**
- The text is a news headline or factual report without emotive language.
- The user is asking a question or seeking information without a clear stance.
- The user expresses mixed feelings that cancel each other out perfectly.
- **STRICT RULE:** If the sentiment is ambiguous, sarcastic but unclear, or if you are unsure, YOU MUST LABEL IT 1.

### CONTEXT KNOWLEDGE (Do not output this, use it to reason):
- **Article 47:** Allows active military in civilian ministries. Critics call it "return of Dwifungsi." Supporters call it "competence optimization."
- **Article 53:** Extends retirement age. Critics call it "gerontocracy." Supporters call it "retaining expertise."
- **Article 7:** Expands military tasks to 16 areas, including "protection of citizens abroad." Diaspora fears this allows surveillance/kidnapping.
- **Timeline:** Ratified on March 20, 2025, amidst protests.

### RESPONSE FORMAT:
You must output a JSON object containing the "reasoning" (in Indonesian) and the "label" (integer).
Example: {"reasoning": "User uses sarcasm ('Selamat datang Orba') to criticize the bill.", "label": 0}

<|im_end|>
<|im_start|>user
Classify this text: "Bagus banget revisinya, biar sekalian aja tentara jadi gubernur semua. Hancur demokrasi."
<|im_end|>
<|im_start|>assistant
{"reasoning": "User uses heavy sarcasm. 'Bagus banget' is negated by 'hancur demokrasi' and the suggestion that soldiers become governors is a critique of Dwifungsi (stratification).", "label": 0}
<|im_end|>
<|im_start|>user
Classify this text: "Rapat paripurna DPR hari ini resmi mengesahkan RUU TNI menjadi Undang-Undang."
<|im_end|>
<|im_start|>assistant
{"reasoning": "This is a factual statement describing a news event (ratification) without expressing support or opposition.", "label": 1}
<|im_end|>
<|im_start|>user
Classify this text: "TNI adalah garda terdepan bangsa. Revisi ini penting untuk menjamin kesejahteraan prajurit dan modernisasi alutsista. Maju terus!"
<|im_end|>
<|im_start|>assistant
{"reasoning": "User explicitly supports the revision using positive keywords like 'penting', 'kesejahteraan', and 'maju terus'. Supports the institution.", "label": 2}
<|im_end|>
<|im_start|>user
Classify this text: "Mulai deh pasal karet 'perlindungan WNI' dipakai buat mata-matain kita yang lagi kuliah di luar negeri. Ngeri banget."
<|im_end|>
<|im_start|>assistant
{"reasoning": "User expresses specific fear regarding Article 7 ('perlindungan WNI') and explicitly mentions surveillance ('mata-matain') and fear ('ngeri'). This aligns with diaspora opposition to stratification.", "label": 0}
<|im_end|>
<|im_start|>user
Classify this text: "{input_text}"
<|im_end|>
<|im_start|>assistant
"""


def label_text(row):
    text = row["content"]
    # Initialize defaults to ensure data consistency on failure
    row["sentiment"] = 0
    try:
        response = ollama.chat(
            model="qwen2:7b",
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
dataset["train"] = sentiment_train_ds
dataset.push_to_hub("tianharjuno/twitter-parse", commit_message="labeled sentiment train ds")

sentiment_test_ds = sentiment_test_ds.map(label_text, num_proc=30)
dataset["test"] = sentiment_test_ds
dataset["train"] = sentiment_train_ds
dataset.push_to_hub("tianharjuno/twitter-parse", commit_message="labeled sentiment test ds")