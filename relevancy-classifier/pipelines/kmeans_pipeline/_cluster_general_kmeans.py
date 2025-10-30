from sklearn.cluster import KMeans
from umap import UMAP
from ._tune_kmeans import find_optimal_kmeans_clusters
import pandas as pd
import numpy as np
from typing import Tuple, Dict, Any

def sample_with_popular_kmeans(
    original_embeddings: np.ndarray,
    n_samples: int,
    target_dimension: int = 10,
    k_max: int = 20,
    seed: int = 42
) -> Tuple[np.ndarray, KMeans, pd.DataFrame, int]:
    """
    Runs the full "Standard" pipeline:
    1. 1-Step UMAP (to `target_dimension`)
    2. KMeans optimization (up to `k_max`)
    3. Balanced sampling (to `n_samples`)

    Args:
        original_embeddings: The full, high-dimensional embeddings (e.g., 40k, 768d).
        n_samples: The fixed budget of samples to return (e.g., 8000).
        target_dimension: The dimension to reduce to (e.g., 10).
        k_max: Max clusters to test for KMeans.
        seed: Random state for reproducibility.

    Returns:
        A tuple of:
        - sampled_indices (np.ndarray): The final indices to select.
        - reducer (UMAP): The fitted UMAP model.
        - best_model (KMeans): The fitted (best k) KMeans model.
        - optimization_results (pd.DataFrame): The KMeans optimization scores.
        - best_k (int): The optimal k that was found.
    """
    
    print(f"\n--- Running 'Standard' Pipeline (1-Step UMAP -> KMeans) ---")
    print(f"Target sample size: {n_samples:,}, Target UMAP dimension: {target_dimension}")

    # --- 1. Standard 1-Step UMAP Reduction ---
    print(f"Running 1-step UMAP to {target_dimension}D...")
    reducer = UMAP(
        n_neighbors=15,          # Standard default, more robust than 5
        n_components=target_dimension,
        min_dist=0.0,            # Best for clustering
        metric='cosine',         # Best for text embeddings
        random_state=seed,
        n_jobs=-1
    )
    reduced_embedding = reducer.fit_transform(original_embeddings)
    print("UMAP reduction complete.")

    # --- 2. Optimize KMeans & Get Labels ---
    (
        best_model, 
        optimization_results, 
        best_k
    ) = find_optimal_kmeans_clusters(
        reduced_embedding,  # type: ignore
        k_max=k_max, 
        k_min=2, 
        random_state=seed
    )

    labels = best_model.labels_
    all_indices = np.arange(len(labels))
    rng = np.random.RandomState(seed)

    # --- 3. Calculate Balanced Sample Sizes ---
    n_per_cluster = n_samples // best_k
    remainder = n_samples % best_k
    print(f"Sampling {n_per_cluster} from most clusters, {remainder} clusters get +1...")

    sample_sizes: Dict[int, int] = {}
    for i in range(best_k):
        sample_sizes[i] = n_per_cluster
        if i < remainder:
            sample_sizes[i] += 1 

    # --- 4. Perform Robust Balanced Sampling (on indices) ---
    sampled_indices_list = []
    
    for cluster_id, n_to_sample in sample_sizes.items():
        indices_in_cluster = all_indices[labels == cluster_id]
        
        # --- Robustness Check ---
        actual_sample_size = min(n_to_sample, len(indices_in_cluster))
        if n_to_sample > len(indices_in_cluster) and len(indices_in_cluster) > 0:
            print(f"  Warning: Cluster {cluster_id} only has {len(indices_in_cluster)} "
                  f"samples (target was {n_to_sample}). Taking all.")

        if len(indices_in_cluster) == 0:
            print(f"  Warning: Cluster {cluster_id} has 0 samples. Skipping.")
            continue
        chosen_indices = rng.choice(
            indices_in_cluster, 
            size=actual_sample_size, 
            replace=False
        )
        sampled_indices_list.append(chosen_indices)
    # Combine all the sampled indices into one array
    sampled_indices = np.concatenate(sampled_indices_list)
    # Shuffle the final list so it's not ordered by cluster
    rng.shuffle(sampled_indices)
    print(f"Successfully created balanced sample of {len(sampled_indices):,} indices.")
    return sampled_indices, best_model, optimization_results, best_k