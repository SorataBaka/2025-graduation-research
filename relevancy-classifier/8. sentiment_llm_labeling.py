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

### CORE CONTEXT (RUU TNI 2025)
The revision is highly controversial. You must understand these specific articles to classify correctly:
*   **Article 47 (Civilian Posts):** Allows active soldiers in 14+ civilian ministries. Critics call this "Dwifungsi" (Dual Function) or "Shadow Bureaucracy." Supporters call it "Competence."
*   **Article 53 (Retirement Age):** Extends retirement age. Critics call this "Colonel Bottleneck" or "Gerontocracy."
*   **Article 7 (Tasks):** Expands role to "Cyber Threats" and "Protection of Citizens Abroad." Critics fear "Surveillance," "Cyber Army," and "Kidnapping."

### STRICT ENTITY DEFINITIONS (CRITICAL FOR ACCURACY)
1.  **PARCOK ("Partai Coklat"):** Refers to the **POLICE (Polri)**.
    *   **RULE:** Hating "Parcok" is **NOT** hating the RUU TNI.
    *   If a tweet attacks Parcok but ignores the TNI bill, label as **LABEL 1 (NEUTRAL/IRRELEVANT)**.
    *   If a tweet compares them (e.g., "Parcok is bad, now Loreng wants to be bad too"), it is **LABEL 0 (OPPOSE)**.
2.  **LORENG / WERENG / APARAT:**
    *   "Loreng" = TNI (Relevant).
    *   "Wereng" = Usually Police (Irrelevant), but check context.
    *   "Aparat" = Ambiguous. If discussing "Jabatan Sipil" (Civilian jobs), it refers to TNI.
3.  **MULYONO:** Derogatory name for President Jokowi.
    *   **RULE:** If used with RUU TNI, it implies the bill is a tool for dynastic power/authoritarianism. Label **LABEL 0 (OPPOSE)**.

### LABELING CATEGORIES
*   **LABEL 2: POSITIVE (Support)**
    *   Explicit agreement.
    *   Keywords: "Setuju," "Dukung," "Profesional," "Sinergi," "Kesejahteraan Prajurit," "Efisiensi," "NKRI Harga Mati."
*   **LABEL 0: NEGATIVE (Oppose)**
    *   Disagreement, Fear, or Sarcasm regarding the bill.
    *   Keywords: "Tolak," "Bahaya," "Orba," "Junta," "Dwifungsi," "Mundur," "Indonesia Gelap," "Peringatan Darurat," "Mulyono," "Surveillance," "Mata-mata."
*   **LABEL 1: NEUTRAL (Unsure/Factual/Irrelevant)**
    *   News headlines (e.g., "DPR passes bill").
    *   Ambivalent statements.
    *   **Off-topic rants about the Police (Parcok) that do not mention the TNI Bill.**

### RESPONSE FORMAT
You must output a JSON object containing the "reasoning" (in Indonesian) and the "label" (integer).

### EXAMPLES (FEW-SHOT)

Input: "Parcok anjing, kerjaannya nilang doang! Bubarin aja polisi."
Output: {"reasoning": "User is attacking the Police (Parcok) regarding traffic tickets. This is unrelated to the RUU TNI.", "label": 1}

Input: "Mantap, akhirnya tentara bisa masuk kementerian. Biar disiplin tuh PNS pemalas."
Output: {"reasoning": "User supports Article 47 (Military in Ministries), believing it will improve discipline among civil servants.", "label": 2}

Input: "Gila ya Mulyono, dwifungsi dihidupkan lagi. Selamat datang Orba jilid 2."
Output: {"reasoning": "User uses 'Mulyono' (negative indicator) and explicitly frames the bill as the return of 'Dwifungsi' and 'New Order' (Orba).", "label": 0}

Input: "Bagus banget revisinya, biar sekalian aja tentara jadi gubernur semua. Hancur demokrasi."
Output: {"reasoning": "User uses heavy sarcasm. 'Bagus banget' is negated by 'hancur demokrasi'. The suggestion of soldiers becoming governors is a critique of stratification.", "label": 0}

Input: "Tolak RUU TNI! Jangan sampai pasal 7 dipakai buat mata-matain mahasiswa di luar negeri."
Output: {"reasoning": "User opposes Article 7 specifically regarding the 'protection of citizens abroad' clause, interpreting it as surveillance.", "label": 0}

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
            model="qwen2.5:7b",
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