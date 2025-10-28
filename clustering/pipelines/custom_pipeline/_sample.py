import math
import numpy as np
from datasets import Dataset, concatenate_datasets
from tqdm import tqdm
from typing import Dict, Any
def generate_ablation_sample(
    dataset: Dataset, 
    labels: np.ndarray, 
    probabilties: np.ndarray, 
    target_dataset_count: int, 
    seed: int,
    filter_mode: str = "above_mean_std",  
    inter_cluster_strategy: str = "direct_proportion", 
    intra_cluster_bias: str = "uniform" 
):
    """
    Generates a sample set based on the full 3-Dimensional ablation grid:
    1. Filters data based on statistical probability thresholds (filter_mode).
    2. Calculates sample counts based on inter-cluster strategy (e.g., direct proportion).
    3. Selects points within the cluster based on intra-cluster bias (e.g., inverse probability).
    """
    labels = np.array(labels)
    probabilties = np.array(probabilties) 
    dataset_mask = labels != -1
    dataset = dataset.select(np.where(dataset_mask)[0])
    labels = labels[dataset_mask]
    probabilties = probabilties[dataset_mask]
    distinct_labels = np.unique(labels)
    cluster_data_map = {} 
    total_filtered_points = 0
    print(f"Applying Filter Mode: '{filter_mode}'")
    for label in distinct_labels:
        cluster_mask = labels == label
        cluster_indices_original = np.where(cluster_mask)[0]
        cluster_probabilities = probabilties[cluster_mask]
        if len(cluster_indices_original) == 0: continue
        cluster_mean_prob = np.mean(cluster_probabilities)
        cluster_std_prob = np.std(cluster_probabilities)
        if filter_mode == "above_mean":
            filter_mask = cluster_probabilities > cluster_mean_prob
        elif filter_mode == "below_mean":
            filter_mask = cluster_probabilities <= cluster_mean_prob
        elif filter_mode == "above_mean_std":
            threshold = cluster_mean_prob - cluster_std_prob
            filter_mask = cluster_probabilities > threshold
        else: 
            filter_mask = np.ones_like(cluster_probabilities, dtype=bool) 
        valid_indices_in_cluster = np.where(filter_mask)[0]
        if len(valid_indices_in_cluster) > 0:
            original_dataset_indices = cluster_indices_original[valid_indices_in_cluster]
            cluster_data_map[label] = {
                "indices": original_dataset_indices,
                "count": len(original_dataset_indices),
                "probabilities": cluster_probabilities[valid_indices_in_cluster] 
            }
            total_filtered_points += len(original_dataset_indices)
    if total_filtered_points == 0:
        print("Warning: Filter removed all data. Returning empty dataset.")
        return None
    sample_budget_map: Dict[Any, int] = {}
    num_clusters = len(cluster_data_map)
    print(f"Calculating Inter-Cluster Strategy: '{inter_cluster_strategy}'")
    if inter_cluster_strategy == "equal":
        per_cluster_budget = math.ceil(target_dataset_count / num_clusters)
        for label in cluster_data_map.keys():
            sample_budget_map[label] = per_cluster_budget
    elif inter_cluster_strategy == "direct_proportion":
        for label, data in cluster_data_map.items():
            proportion = data["count"] / total_filtered_points
            sample_budget_map[label] = round(proportion * target_dataset_count)
    final_sample_datasets = []
    print(f"Executing Intra-Cluster Bias: '{intra_cluster_bias}'")
    for label, data in tqdm(cluster_data_map.items()):
        num_to_sample = sample_budget_map.get(label, 0)
        if num_to_sample > data["count"]:
            num_to_sample = data["count"]
        if num_to_sample == 0 and data["count"] > 0:
            num_to_sample = 1
        if num_to_sample <= 0: continue
        weights = None 
        if intra_cluster_bias == "inverse_prob":
            weights = 1.0 / (data["probabilities"] + 1e-6)
            weights = weights / np.sum(weights)
        elif intra_cluster_bias == "mild_inverse_prob":
            weights = (1.0 - data["probabilities"]) + 1e-5
            weights = weights / np.sum(weights)
        elif intra_cluster_bias == "confidence_prob":
            weights = data["probabilities"]
            weights = weights / np.sum(weights)
        np.random.seed(seed)
        if weights is not None and len(weights) == len(data["indices"]):
            sampled_indices_in_cluster = np.random.choice(
                data["indices"], 
                size=int(num_to_sample), 
                replace=False,
                p=weights.ravel()
            )
        else:
            sampled_indices_in_cluster = np.random.choice(
                data["indices"], 
                size=int(num_to_sample), 
                replace=False
            )
        sampled_sets = dataset.select(sampled_indices_in_cluster.tolist())
        final_sample_datasets.append(sampled_sets)
    if not final_sample_datasets:
        return None
    return concatenate_datasets(final_sample_datasets)