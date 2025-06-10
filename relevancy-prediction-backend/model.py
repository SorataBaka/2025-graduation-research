from typing import List, Dict, Optional
from label_studio_ml.model import LabelStudioMLBase
from label_studio_ml.response import ModelResponse

from transformers import AutoModelForSequenceClassification, AutoTokenizer, AutoConfig
import torch
HUGGINGFACE_PATH = "tianharjuno/ruu-tni-relevancy-classification"
BASE_SAVE_PATH="preload/"
class NewModel(LabelStudioMLBase):    
    def setup(self):
        id2label = {
            0: "irrelevant",
            1: "relevant"
        }
        label2id = {v: k for k, v in id2label.items()}
        
        config = AutoConfig.from_pretrained(
            BASE_SAVE_PATH + "model",
            num_labels=2,
            id2label=id2label,
            label2id=label2id
        )
        
        self.set("model_version", "1.0.0")
        self.model = AutoModelForSequenceClassification.from_pretrained(BASE_SAVE_PATH + "model", local_files_only=True,config=config,torch_dtype="auto", device_map="cpu", low_cpu_mem_usage=False)
        self.tokenizer = AutoTokenizer.from_pretrained(BASE_SAVE_PATH+"tokenizer", local_files_only=True)
        self.model.eval()   
        self.device = torch.device("cpu")
        self.id2label = id2label

    def predict(self, tasks: List[Dict], context: Optional[Dict] = None, **kwargs) -> ModelResponse:
        """ Write your inference logic here
            :param tasks: [Label Studio tasks in JSON format](https://labelstud.io/guide/task_format.html)
            :param context: [Label Studio context in JSON format](https://labelstud.io/guide/ml_create#Implement-prediction-logic)
            :return model_response
                ModelResponse(predictions=predictions) with
                predictions: [Predictions array in JSON format](https://labelstud.io/guide/export.html#Label-Studio-JSON-format-of-annotated-tasks)
        """
        results = []
        print(next(self.model.parameters()).device)

        for task in tasks:
            text = task.get("data", {}).get("content", "")
            if not text:
                results.append({
                    "result": []
                })
                continue
            inputs = self.tokenizer(text, return_tensors="pt", truncation=True, padding="max_length", max_length=256)
            inputs = {k: v.to(self.device) for k, v in inputs.items()}
            with torch.no_grad():
                outputs = self.model(**inputs)
            logits = outputs.logits
            probabilities = torch.softmax(logits, dim=1).squeeze()
            index = int(torch.argmax(probabilities).item())
            results.append({
                'score': probabilities[index].item(),
                "result": [{
                    "from_name": "sentiment",
                    "to_name": "text",
                    "type": "choices",
                    "value": {"choices": [self.model.config.id2label[index]]},
                }]
            })        
        return ModelResponse(predictions=results, )
    
    def fit(self, event, data, **kwargs):
        # use cache to retrieve the data from the previous fit() runs
        old_data = self.get('my_data')
        old_model_version = self.get('model_version')
        print(f'Old data: {old_data}')
        print(f'Old model version: {old_model_version}')

        # store new data to the cache
        self.set('my_data', 'my_new_data_value')
        self.set('model_version', 'my_new_model_version')
        print(f'New data: {self.get("my_data")}')
        print(f'New model version: {self.get("model_version")}')

        print('fit() completed successfully.')

