def ensemble_predict(models, x):
    preds = [m(x).item() for m in models]
    return sum(preds) / len(preds)