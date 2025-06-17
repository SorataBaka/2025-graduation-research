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
import nltk
from nltk.corpus import stopwords
import emoji
from sklearn.preprocessing import StandardScaler

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
      
# now do structural analysis

try:
  stopwords.words('english')
except LookupError:
  nltk.download('stopwords')
stopwords_combined = set(stopwords.words("indonesian")) | set(stopwords.words("english"))

def extract_structural_features(tweet):
  words = tweet.split()
  word_lengths = [len(w) for w in words]
  
  length = len(tweet)
  num_hashtags = tweet.count("#")
  num_mentions = tweet.count("@")
  num_urls = len(re.findall(r"http\S+", tweet))
  num_emojis = len([c for c in tweet if c in emoji.EMOJI_DATA])
  num_upper = sum(1 for c in tweet if c.isupper())
  num_punct = len(re.findall(r"[^\w\s]", tweet))
  avg_word_len = np.mean(word_lengths) if words else 0

  # Content/structure-oriented features
  is_question = int(tweet.strip().endswith('?'))
  is_exclamatory = int(tweet.strip().endswith('!'))
  contains_ellipsis = int("..." in tweet)
  contains_repeated_chars = int(bool(re.search(r"(.)\1{2,}", tweet)))  # e.g., sooo, yessss
  contains_short_link = int(bool(re.search(r"\b(?:https?:\/\/)?(?:www\.)?(bit\.ly|t\.co|tinyurl\.com|goo\.gl|ow\.ly|is\.gd|buff\.ly|adf\.ly|bitly\.com|cutt\.ly|rb\.gy|rebrand\.ly)\/[A-Za-z0-9]+", tweet)))
  contains_digit = int(bool(re.search(r"\d", tweet)))
  is_all_caps = int(tweet.isupper() and len(tweet) > 3)
  is_emoji_only = int(all(c in emoji.EMOJI_DATA or c.isspace() for c in tweet.strip()) and tweet.strip() != "")
  contains_quote_or_rt = int(bool(re.search(r"(RT\s@|\".+\")", tweet)))
  word_count = len(words)
  stopword_ratio = np.mean([w.lower() in stopwords_combined for w in words]) if words else 0

  return [
    length, num_hashtags, num_mentions, num_urls,
    num_emojis, num_upper, num_punct, avg_word_len,
    is_question, is_exclamatory, contains_ellipsis,
    contains_repeated_chars, contains_short_link,
    contains_digit, is_all_caps, is_emoji_only,
    contains_quote_or_rt, word_count, stopword_ratio
  ]
  
#initialize scaler for both concatenated and property only arrays
concat_scaler = StandardScaler()
props_scaler = StandardScaler()

#Read from indobert reduced embeddings
with open("out/indobert_reduced_embeds.jsonl", "r", encoding="utf-8") as file:
  reduced_embed_documents = []
  for line in file:
    doc = json.loads(line)
    reduced_embed_documents.append(doc)

#Generate structural features for all content
cleaned_documents = [doc["cleaned_content"] for doc in reduced_embed_documents]
structure_properties = [extract_structural_features(doc) for doc in cleaned_documents]

for docs, props in zip(reduced_embed_documents, structure_properties):
  docs["joined_properties"] = np.concatenate([np.array(docs["embedding"]), np.array(props)])
  docs["properties"] = props

joined_properties = [doc["joined_properties"] for doc in reduced_embed_documents]
properties_only = [doc["properties"] for doc in reduced_embed_documents]

concat_scaler.fit(joined_properties)
props_scaler.fit(properties_only)

for docs in reduced_embed_documents:
  docs["joined_properties"] = concat_scaler.transform(np.array(docs["joined_properties"]).reshape(1, -1)).tolist()
  docs["properties"] = props_scaler.transform(np.array(docs["properties"]).reshape(1, -1)).tolist()
  
with open("out/indobert_props_embedded.jsonl", "w", encoding="utf-8") as file:
  json.dump(reduced_embed_documents, file, ensure_ascii=False, indent=2)
  
# do it for indobertweet embeddings
with open("out/indobertweet_reduced_embeds.jsonl", "r", encoding="utf-8") as file:
  reduced_embed_documents = []
  for line in file:
    doc = json.loads(line)
    reduced_embed_documents.append(doc)

#Generate structural features for all content
cleaned_documents = [doc["cleaned_content"] for doc in reduced_embed_documents]
structure_properties = [extract_structural_features(doc) for doc in cleaned_documents]

for docs, props in zip(reduced_embed_documents, structure_properties):
  docs["joined_properties"] = np.concatenate([np.array(docs["embedding"]), np.array(props)])
  docs["properties"] = props

joined_properties = [doc["joined_properties"] for doc in reduced_embed_documents]
properties_only = [doc["properties"] for doc in reduced_embed_documents]

concat_scaler.fit(joined_properties)
props_scaler.fit(properties_only)

for docs in reduced_embed_documents:
  docs["joined_properties"] = concat_scaler.transform(np.array(docs["joined_properties"]).reshape(1, -1)).tolist()
  docs["properties"] = props_scaler.transform(np.array(docs["properties"]).reshape(1, -1)).tolist()
  
with open("out/indobertweet_props_embedded.jsonl", "w", encoding="utf-8") as file:
  json.dump(reduced_embed_documents, file, ensure_ascii=False, indent=2)