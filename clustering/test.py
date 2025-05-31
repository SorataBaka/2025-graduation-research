import json
def count_jsonl(file_path):
  with open(file_path, "r") as f:
    return sum(1 for _ in f)
def count_json(file_path):
  with open(file_path, "r") as f:
    return len(json.load(f))
print(f"Number of JSON objects: {count_jsonl('deduplicated.jsonl')}")
print(f"Number of JSON objects: {count_json('out/cleaned-formatted.json')}")