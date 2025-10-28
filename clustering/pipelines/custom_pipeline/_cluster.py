import numpy as np
from hdbscan import HDBSCAN
from umap import UMAP
from sklearn.neighbors import NearestNeighbors
import skdim
from skopt import gp_minimize
from skopt.space import Integer
from hdbscan.validity import validity_index
def calculate_elbow_angle(k, data):
    neighbors = NearestNeighbors(n_neighbors=k + 1, metric="euclidean").fit(data)
    distances, _ = neighbors.kneighbors(data)
    k_distances = np.sort(distances[:, -1])
    n_points = len(k_distances)
    plateau_end = int(n_points * 0.8)
    cliff_start = int(n_points * 0.9)
    x_plateau = np.arange(plateau_end).reshape(-1, 1)
    y_plateau = k_distances[:plateau_end]
    x_cliff = np.arange(cliff_start, n_points).reshape(-1, 1)
    y_cliff = k_distances[cliff_start:]
    m1, _ = np.polyfit(x_plateau.ravel(), y_plateau, 1) 
    m2, _ = np.polyfit(x_cliff.ravel(), y_cliff, 1)   
    sharpness = m2 - m1
    return -sharpness 
def objective_for_hdbscan(params, data):
    min_samples = max(2, int(params[0]))
    min_cluster_size = max(2, int(params[1]))
    clusterer = HDBSCAN(
        min_samples=min_samples,
        min_cluster_size=min_cluster_size,
        metric="euclidean",
        gen_min_span_tree=True,
        allow_single_cluster=False,
        core_dist_n_jobs=-1,
        cluster_selection_method="eom"
    )
    clusterer.fit(data)
    if clusterer.relative_validity_.size == 0:
        return 0.0
    return -np.sum(clusterer.relative_validity_)
def objective_for_dbcv(params, data):
    min_samples = max(2, int(params[0]))
    min_cluster_size = max(2, int(params[1]))
    if min_samples > min_cluster_size:
        return 1.0 
    clusterer = HDBSCAN(
        min_samples=min_samples,
        min_cluster_size=min_cluster_size,
        metric="euclidean",
        gen_min_span_tree=True, 
        core_dist_n_jobs=-1,
        cluster_selection_method="eom"
    )
    clusterer.fit(data)
    labels = clusterer.labels_
    non_noise_indices = np.where(labels != -1)[0]
    unique_labels = np.unique(labels[non_noise_indices])
    if len(unique_labels) < 2:
        return 1.0 
    non_noise_data = data[non_noise_indices]
    non_noise_labels = labels[non_noise_indices]
    try:
        dbcv_score = validity_index(
            non_noise_data, 
            non_noise_labels, 
            metric='euclidean',
            verbose=True
        )
        return -dbcv_score  #type: ignore
    except Exception as e:
        return 1.0 
def cluster_custom(raw_embeddings, seed=42, mode="stability"):
    if mode.lower() not in ["heuristic", "stability", "mix", "dbcv"]:
        raise Exception("mode must either be heuristic, stability, mix, or dbcv")
    twonn = skdim.id.TwoNN()
    intrinsic = int(np.clip(np.round(twonn.fit_transform(raw_embeddings)), 5, 50))
    print(f"Found intrinsic dimension of {intrinsic} with TwoNN")
    first_reductor = UMAP(n_neighbors=100, n_components=intrinsic, metric="cosine", random_state=seed, min_dist=0.0, n_jobs=-1)
    second_reductor = UMAP(n_neighbors=20, n_components=10, metric="euclidean", random_state=seed, min_dist=0.0, n_jobs=-1)
    print("Running first stage UMAP")
    reduced_embedding = first_reductor.fit_transform(raw_embeddings)
    print("Running second stage UMAP")
    reduced_embedding = second_reductor.fit_transform(reduced_embedding)
    print(f"Tuning HDBSCAN with mode: '{mode}'")
    best_min_samples = 5  
    best_min_cluster_size = 5 
    if mode.lower() ==  "heuristic":
        print("  -> Using 'heuristic' mode (Bayesian Optimization on k-distance elbow)")
        search_space = [Integer(5, 100, name='k')]
        optimization_result = gp_minimize(
            lambda x: calculate_elbow_angle(x[0], reduced_embedding),
            dimensions=search_space,
            n_calls=25,
            random_state=seed,
            verbose=False,
            n_jobs=-1
        )
        best_min_samples = optimization_result.x[0]
        best_min_cluster_size = 5 
    elif mode.lower() == "mix":
        print("  -> Using 'mix' mode (Heuristic for min_samples, min_cluster_size = min_samples)")
        search_space = [Integer(5, 100, name='k')]
        optimization_result = gp_minimize(
            lambda x: calculate_elbow_angle(x[0], reduced_embedding),
            dimensions=search_space,
            n_calls=25,
            random_state=seed,
            verbose=False,
            n_jobs=-1
        )
        best_min_samples = optimization_result.x[0]
        best_min_cluster_size = best_min_samples 
    elif mode.lower() == "dbcv":
        print("  -> Using 'dbcv' mode (Bayesian Optimization on DBCV score)")
        search_space = [
            Integer(5, 500, name='min_samples'),
            Integer(5, 500, name='min_cluster_size')
        ]
        optimization_result = gp_minimize(
            func=lambda params: objective_for_dbcv(params, reduced_embedding),
            dimensions=search_space,
            n_calls=30, 
            random_state=seed,
            verbose=False,
            n_jobs=-1
        )
        best_min_samples, best_min_cluster_size = optimization_result.x
    else: 
        print("  -> Using 'stability' mode (Bayesian Optimization on relative_validity)")
        search_space = [
            Integer(5, 500, name='min_samples'),
            Integer(5, 500, name='min_cluster_size')
        ]
        optimization_result = gp_minimize(
            func=lambda params: objective_for_hdbscan(params, reduced_embedding),
            dimensions=search_space,
            n_calls=30,
            random_state=seed,
            verbose=False,
            n_jobs=-1
        )
        best_min_samples, best_min_cluster_size = optimization_result.x
    print(f"Final params: min_samples={best_min_samples}, min_cluster_size={best_min_cluster_size}")
    clusterer = HDBSCAN(
        min_cluster_size=best_min_cluster_size,
        min_samples=best_min_samples,
        metric="euclidean",
        allow_single_cluster=False,
        core_dist_n_jobs=-1,
        cluster_selection_method="eom",
        gen_min_span_tree=True
    )
    print("Predicting clusters with HDBSCAN")
    labels = clusterer.fit_predict(reduced_embedding) #type: ignore
    return reduced_embedding, labels, clusterer.probabilities_