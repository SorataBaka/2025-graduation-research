import pandas as pd
import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from typing import Tuple, Dict, Any
from joblib import Parallel, delayed

def _fit_one_k(k: int, data: np.ndarray, random_state: int) -> Dict[str, Any]:
    """
    Helper function to fit a single KMeans model for a given k.
    This is the function that will be run in parallel.
    """
    kmeans = KMeans(
        n_clusters=k, 
        random_state=random_state, 
        n_init='auto'  # 'auto' will default to 1 run since init='k-means++'
    )
    kmeans.fit(data)
    silhouette_avg = silhouette_score(data, kmeans.labels_)
    
    return {
        'k': k,
        'inertia': kmeans.inertia_,
        'silhouette_score': silhouette_avg
    }

def find_optimal_kmeans_clusters(
    data: np.ndarray, 
    k_max: int, 
    k_min: int = 2, 
    random_state: int = 42
) -> Tuple[KMeans, pd.DataFrame, int]:
    k_values = range(k_min, k_max + 1)
    print(f"Optimizing KMeans in PARALLEL for k from {k_min} to {k_max} across all cores...")

    results = Parallel(n_jobs=-1)(
        delayed(_fit_one_k)(k, data, random_state) for k in k_values
    )
    results_df = pd.DataFrame(results).set_index('k')
    
    if results_df.empty:
        print("Warning: No k values were tested.")
        return None, results_df, k_min

    best_k = int(results_df['silhouette_score'].idxmax())
    best_silhouette_score = results_df['silhouette_score'].max()
    print(f"\nOptimization Complete. Best k={best_k} (Silhouette: {best_silhouette_score:.4f})")
    
    best_model = KMeans(
        n_clusters=best_k, 
        random_state=random_state, 
        n_init='auto'
    )
    best_model.fit(data)
    return best_model, results_df, best_k