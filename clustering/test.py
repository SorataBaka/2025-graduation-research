import json
import os
import requests

# === CONFIG ===
INPUT_FILE = 'out/cleaned-with-labels-1.json'       # Your large file
CHUNK_SIZE = 10000                  # Adjust this as needed
API_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6ODA1NTg3OTgyMSwiaWF0IjoxNzQ4Njc5ODIxLCJqdGkiOiIzZDBhMzkyOGI0MTc0YmU0ODc0MDc4NGE0MTVkYjM4OCIsInVzZXJfaWQiOjF9.6U3b5GCLNujkncoGJ1VSUfSnqAJdT6mXvauGsWJwyXo"       # Replace with your Label Studio token
PROJECT_ID = 4                      # Replace with your project ID
API_URL = f'http://localhost:8080/api/projects/{PROJECT_ID}/import'

HEADERS = {
    'Authorization': f'Token {API_TOKEN}',
    'Content-Type': 'application/json'
}

def load_tasks(filepath):
    with open(filepath, 'r') as f:
        return json.load(f)

def chunk_tasks(tasks, chunk_size):
    for i in range(0, len(tasks), chunk_size):
        yield tasks[i:i + chunk_size]

def upload_chunk(chunk, index):
    print(f'Uploading chunk {index} with {len(chunk)} tasks...')
    response = requests.post(API_URL, headers=HEADERS, json=chunk)
    if response.status_code == 201:
        print(f'✅ Chunk {index} uploaded successfully.')
    else:
        print(f'❌ Error uploading chunk {index}: {response.status_code} {response.text}')

def main():
    tasks = load_tasks(INPUT_FILE)
    for i, chunk in enumerate(chunk_tasks(tasks, CHUNK_SIZE), start=1):
        upload_chunk(chunk, i)

if __name__ == '__main__':
    main()