from transformers import AutoTokenizer, AutoModel
import torch
from tqdm import tqdm
import json
from sklearn.decomposition import PCA
from sklearn.cluster import DBSCAN
from datasets import load_dataset
# Load IndoBERT
tokenizer = AutoTokenizer.from_pretrained("indobenchmark/indobert-base-p2", cache_dir="cache/")
model = AutoModel.from_pretrained("indobenchmark/indobert-base-p2", cache_dir="cache/")
model.eval()


dataset = load_dataset("json", data_files="out/cleaned-formatted.json")



BATCH_SIZE = 150  # adjust based on your GPU/CPU RAM

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
    cls_embeddings = outputs.last_hidden_state[:, 0, :]
    return cls_embeddings.cpu().numpy()  # return numpy array

# Load documents
with open("out/cleaned-formatted.json", "r") as f:
    documents = json.load(f)

# Collect all embeddings
all_embeddings = []
batched_documents = []

for i in tqdm(range(0, len(documents), BATCH_SIZE)):
    batch = documents[i:i + BATCH_SIZE]
    texts = [doc["content"] for doc in batch]
    embeddings = get_batch_embeddings(texts)
    all_embeddings.extend(embeddings)
    batched_documents.extend(batch)

# Dimensionality reduction (PCA to 50 dims)
pca = PCA(n_components=50)
reduced_embeddings = pca.fit_transform(all_embeddings)

# Clustering with DBSCAN
dbscan = DBSCAN(eps=2.0, min_samples=4)  # tweak eps and min_samples if needed
cluster_labels = dbscan.fit_predict(reduced_embeddings)

# Append embedding and cluster label to documents
for doc, emb, label in zip(batched_documents, all_embeddings, cluster_labels):
    doc["cluster_label"] = int(label)  # convert to int for JSON

# Save result
with open("out/data_with_embeddings_and_clusters.json", "w") as f:
    json.dump(batched_documents, f, ensure_ascii=False, indent=2)
