from transformers import AutoTokenizer, AutoModel
import torch
from tqdm import tqdm
import json

tokenizer = AutoTokenizer.from_pretrained("indobenchmark/indobert-base-p2", cache_dir="cache/")
model = AutoModel.from_pretrained("indobenchmark/indobert-base-p2", cache_dir="cache/")
model.eval()

BATCH_SIZE = 16  # adjust depending on available memory

def get_batch_embeddings(text_list):
    inputs = tokenizer(
        text_list,
        padding=True,
        truncation=True,
        max_length=128,
        return_tensors="pt"
    )
    with torch.no_grad():
        outputs = model(**inputs)
    cls_embeddings = outputs.last_hidden_state[:, 0, :]  # CLS token
    return cls_embeddings.tolist()

# Load your documents
with open("out/cleaned-formatted.json", "r") as f:
    documents = json.load(f)

# Process in batches
updated_docs = []
for i in tqdm(range(0, len(documents), BATCH_SIZE)):
    batch = documents[i:i + BATCH_SIZE]
    texts = [doc["content"] for doc in batch]
    embeddings = get_batch_embeddings(texts)
    for doc, emb in zip(batch, embeddings):
        doc["embedding"] = emb
        updated_docs.append(doc)

# Save result
with open("out/data_with_embeddings.json", "w") as f:
    json.dump(updated_docs, f, ensure_ascii=False)