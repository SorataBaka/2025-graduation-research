import pandas as pd
import numpy as np
from sklearn.cluster import KMeans
from typing import Tuple, Dict, Any
from ._tune_kmeans import find_optimal_kmeans_clusters

def sample_with_custom_kmeans(
    embeddings: np.ndarray,
    n_samples: int,
    k_max: int = 20,
    k_min: int = 2,
    random_state: int = 42
) -> Tuple[np.ndarray, KMeans, pd.DataFrame, int]:
    """
    Optimizes KMeans and returns indices for a balanced, fixed-size sample.
    This function finds the optimal number of clusters (k) and then
    performs balanced stratified sampling to select a total of `n_samples` indices.
    Args:
        embeddings: The 2D numerical data to cluster (e.g., UMAP embeddings).
        n_samples: The *total* number of sample indices to return.
        k_max: The maximum number of clusters (k) to test.
        k_min: The minimum number of clusters (k) to test.
        random_state: Seed for reproducibility.
    Returns:
        A tuple containing:
        - sampled_indices (np.ndarray): The 1D array of indices to select.
        - best_model (KMeans): The fitted KMeans model used for clustering.
        - optimization_results (pd.DataFrame): DataFrame with k, inertia, silhouette.
        - best_k (int): The optimal k value that was found and used.
    """
    if n_samples > len(embeddings):
        print(f"Warning: n_samples ({n_samples}) is > total data "
              f"({len(embeddings)}). Returning all indices.")
        n_samples = len(embeddings)
    (
        best_model, 
        optimization_results, 
        best_k
    ) = find_optimal_kmeans_clusters(embeddings, k_max, k_min, random_state)
    labels = best_model.labels_
    all_indices = np.arange(len(labels))
    rng = np.random.RandomState(random_state)
    n_per_cluster = n_samples // best_k
    remainder = n_samples % best_k
    print(f"Target sample size: {n_samples}. Found {best_k} clusters.")
    print(f"Sampling {n_per_cluster} from most clusters, "
          f"with {remainder} clusters getting one extra sample.")
    sample_sizes: Dict[int, int] = {}
    for i in range(best_k):
        sample_sizes[i] = n_per_cluster
        if i < remainder:
            sample_sizes[i] += 1  
    sampled_indices_list = []
    for cluster_id, n_to_sample in sample_sizes.items():
        indices_in_cluster = all_indices[labels == cluster_id]
        actual_sample_size = min(n_to_sample, len(indices_in_cluster))
        if n_to_sample > len(indices_in_cluster):
            print(f"  Warning: Cluster {cluster_id} only has {len(indices_in_cluster)} "
                  f"samples (less than target {n_to_sample}). Taking all.")
        chosen_indices = rng.choice(
            indices_in_cluster, 
            size=actual_sample_size, 
            replace=False
        )
        sampled_indices_list.append(chosen_indices)
    sampled_indices = np.concatenate(sampled_indices_list)
    rng.shuffle(sampled_indices)
    print(f"\nSuccessfully created balanced sample of {len(sampled_indices):,} indices.")
    return sampled_indices, best_model, optimization_results, best_k