import re, unicodedata, jaconv, emoji

_URL      = re.compile(r'https?://\S+')
_MENTION  = re.compile(r'@\w+')
_REPEAT   = re.compile(r'(.)\1{2,}')       # ≥3 of same char
_WS       = re.compile(r'\s+')
_KUTI_CUT = re.compile(r'(?i)kutipan.*$', re.DOTALL)

# --- (MODIFIED) ---
# Catches "word" + "dari" + "domain.com" -> replaces with "word"
# Changed \w+ to \S+ to include punctuation like '!'
_DARI_URL_ATTACHED = re.compile(r'(\S+)dari\s+([a-z0-9.-]+\.[a-z]{2,})\b', re.I) 

# Catches " dari " + "domain.com" -> replaces with empty string
_DARI_URL_SPACED = re.compile(r'\s+dari\s+([a-z0-9.-]+\.[a-z]{2,})\b', re.I)

# Catches any standalone word that looks like a domain.com or domain.id
_DOMAIN_ONLY = re.compile(r'\b[a-z0-9.-]+\.[a-z]{2,}\b', re.I)

# --- (NEW) ---
# Catches any word ending in "dari" (e.g., "anarko!dari", "negaradari")
_DARI_STUCK = re.compile(r'(\S+)dari\b', re.I)

def clean_twitter_text(row: str):
    text = row["content"] #type: ignore
    text = unicodedata.normalize('NFKC', text)
    text = jaconv.z2h(text, kana=False, digit=True, ascii=True)
    text = text.replace("tanya grok", " ")
    text = text.replace("grokproductivitypasang", " ")
    text = text.replace('\\n', ' ').replace('\\r', ' ')
    
    # Handle standard URLs first
    text = _URL.sub(' <url> ', text)
    text = text.replace('<url> ini tidak tersedia', ' ')
    
    # --- (TYPO FIXED) ---
    text = _MENTION.sub('@USER', text)
    text = re.sub(r'^rt\s+', '', text, flags=re.I)
    text = re.sub(r'(\b\d{4})(?=[a-zA-Z])', r'\1 ', text)
    text = _KUTI_CUT.sub('', text)

    # --- RULE ORDER IS IMPORTANT ---
    # 1. Fix "word-dari domain.com" first
    text = _DARI_URL_ATTACHED.sub(r'\1', text) 
    # 2. Fix " word dari domain.com"
    text = _DARI_URL_SPACED.sub('', text)
    
    # --- (ADD THIS LINE) ---
    # 3. Fix any remaining "word-dari"
    text = _DARI_STUCK.sub(r'\1', text)
    # --- END OF ADDITION ---
    
    # 4. Clean up any other standalone domains
    text = _DOMAIN_ONLY.sub(' ', text)

    text = emoji.demojize(text, delimiters=(' ', ' '))
    text = _REPEAT.sub(r'\1', text)
    text = _WS.sub(' ', text).strip().lower()
    row["content"] = text #type: ignore
    return row