from typing import List, Dict, Optional
from label_studio_ml.model import LabelStudioMLBase
from label_studio_ml.response import ModelResponse
from transformers import AutoModelForSequenceClassification, AutoTokenizer
import torch

from typing import cast

class NewModel(LabelStudioMLBase):
    """Custom ML Backend model
    """
    
    def setup(self):
        """Configure any parameters of your model here
        """
        self.set("model_version", "0.0.1")
        self.model = AutoModelForSequenceClassification.from_pretrained("tianharjuno/ruu-tni-relevancy-classification", cache_dir="cache/", device_map=None)
        self.tokenizer = AutoTokenizer.from_pretrained("tianharjuno/ruu-tni-relevancy-classification", cache_dir="cache/")
        self.model.eval()
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model.to(self.device)
        id2label = getattr(self.model.config, "id2label", None)
        if not isinstance(id2label, dict):
            id2label = {0: "irrelevant", 1: "relevant"}  # your fallback

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
        for task in tasks:
            print(task)
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
            label_map = ["irrelevant", "relevant"]
            results.append({
                "result": [{
                    "from_name": "sentiment",
                    "to_name": "text",
                    "type": "choices",
                    "value": {"choices": [label_map[index]]},
                    'score': probabilities[index].item()
                }]
            })
        
    
        print(f'''\
        Run prediction on {tasks}
        Received context: {context}
        Project ID: {self.project_id}
        Label config: {self.label_config}
        Parsed JSON Label config: {self.parsed_label_config}
        Extra params: {self.extra_params}''')
        
        return ModelResponse(predictions=results)
    
    def fit(self, event, data, **kwargs):
        """
        This method is called each time an annotation is created or updated
        You can run your logic here to update the model and persist it to the cache
        It is not recommended to perform long-running operations here, as it will block the main thread
        Instead, consider running a separate process or a thread (like RQ worker) to perform the training
        :param event: event type can be ('ANNOTATION_CREATED', 'ANNOTATION_UPDATED', 'START_TRAINING')
        :param data: the payload received from the event (check [Webhook event reference](https://labelstud.io/guide/webhook_reference.html))
        """

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

