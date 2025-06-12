import json
from transformers import AutoModel, AutoTokenizer
import pandas as pd
import jaconv
import re
import torch
from tqdm import tqdm
import umap
import numpy as np
import os


OUT_DIR = "out/"
ASSET_DIR= "assets/"
with open(ASSET_DIR + "/dump-formatted.json","r", encoding="utf-8") as file:
  raw_documents = json.load(file)

document_ds = pd.DataFrame.from_records(raw_documents)
DATA_LEN = len(document_ds)

def cleantext(text):
  text = jaconv.z2h(text, kana=False, digit=True, ascii=True)
  text = text.replace('\\n', " ").replace("\\r", " ")
  text = re.sub(r'\s+', ' ', text)  
  text = text.strip()
  text = text.lower()
  return text

document_ds["cleaned_content"] = document_ds["content"].apply(cleantext)

# generate 2 types of embeds
indobertweet_model = AutoModel.from_pretrained("indolem/indobertweet-base-uncased", cache_dir="cache/")
indobertweet_tokenizer = AutoTokenizer.from_pretrained("indolem/indobertweet-base-uncased", cache_dir="cache/")
indobert_model = AutoModel.from_pretrained("indobenchmark/indobert-base-p2", cache_dir="cache/")
indobert_tokenizer = AutoTokenizer.from_pretrained("indobenchmark/indobert-base-p2", cache_dir="cache/")

indobertweet_model.eval()
indobert_model.eval()

def getIndobertEncodings(textArray):
  inputs = indobert_tokenizer(
    textArray,
    padding=True,
    truncation=True,
    max_length=128,
    return_tensors="pt"
  )
  with torch.no_grad():
    outputs = indobert_model(**inputs)
  cls_embeddings = outputs.last_hidden_state[:, 0, :]
  return cls_embeddings.cpu().numpy()

def getIndobertTweetEncodings(textArray):
  inputs = indobertweet_tokenizer(
    textArray,
    padding=True,
    truncation=True,
    max_length=128,
    return_tensors="pt"
  )
  with torch.no_grad():
    outputs = indobertweet_model(**inputs)
  cls_embeddings = outputs.last_hidden_state[:, 0, :]
  return cls_embeddings.cpu().numpy()

  
def batch_cls_embeddings(documents, batch_size=32):
  documents_list = documents.to_dict(orient="records")
  for i in tqdm(range(0, len(documents), batch_size), desc="Generating embeddings"):
    batched_documents = documents_list[i:i+batch_size]
    batched_texts = [doc["cleaned_content"] for doc in batched_documents]
    
    indobert_embeddings = getIndobertEncodings(batched_texts)
    indobertweet_embeddings = getIndobertTweetEncodings(batched_texts)
    
    with open("out/indobert_embeds.jsonl", "a", encoding="utf-8") as file:
      for doc, embed in zip(batched_documents, indobert_embeddings):
        doc_copy = doc.copy()
        doc_copy["embedding"] = embed.tolist()
        file.write(json.dumps(doc_copy, ensure_ascii=False)+ "\n")
        
    with open("out/indobertweet_embeds.jsonl", "a", encoding="utf-8") as file:
      for doc, embed in zip(batched_documents, indobertweet_embeddings):
        doc_copy = doc.copy()
        doc_copy["embedding"] = embed.tolist()
        file.write(json.dumps(doc_copy, ensure_ascii=False)+ "\n")

def removeFile(file_path):
  if os.path.exists(file_path):
    os.remove(file_path)
    print(f"{file_path} deleted.")
  else:
    print(f"{file_path} does not exist.")
     
removeFile("out/indobertweet_embeds.jsonl")
removeFile("out/indobert_embeds.jsonl")

batch_cls_embeddings(document_ds[:100])

def reduce_embed_size(embeds):
  umap_model = umap.UMAP(n_components=45)
  reduced_embedding  = umap_model.fit_transform(np.array(embeds))
  return reduced_embedding

removeFile("out/indobert_reduced_embeds.jsonl")
removeFile("out/indobertweet_reduced_embeds.jsonl")

with open("out/indobert_embeds.jsonl", "r", encoding="utf-8") as file:
  embedded_documents = []
  for line in file:
    doc = json.loads(line)
    embedded_documents.append(doc)
    
  embeds = [doc["embedding"] for doc in embedded_documents]
  
  print("Reducing embed size for IndoBERT...")
  reduced_embed = reduce_embed_size(embeds)
  
  with open("out/indobert_reduced_embeds.jsonl", "a", encoding="utf-8") as writefile:
    for reduced, doc in zip(reduced_embed, embedded_documents):
      doc["embedding"] = reduced.tolist()
      writefile.write(json.dumps(doc, ensure_ascii=False) + "\n")
      
with open("out/indobertweet_embeds.jsonl", "r", encoding="utf-8") as file:
  embedded_documents = []
  for line in file:
    doc = json.loads(line)
    embedded_documents.append(doc)
    
  embeds = [doc["embedding"] for doc in embedded_documents]
  
  print("Reducing embed size for IndoBERTweet...")
  reduced_embed = reduce_embed_size(embeds)
  
  with open("out/indobertweet_reduced_embeds.jsonl", "a", encoding="utf-8") as writefile:
    for reduced, doc in zip(reduced_embed, embedded_documents):
      doc["embedding"] = reduced.tolist()
      writefile.write(json.dumps(doc, ensure_ascii=False) + "\n")
      

