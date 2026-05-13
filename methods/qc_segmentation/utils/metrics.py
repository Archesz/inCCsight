"""Classification metrics helpers."""

from __future__ import annotations

import numpy as np
import matplotlib.pyplot as plt
from sklearn import metrics


def report_metrics(cm: np.ndarray) -> tuple[float, float, float, float]:
    """Return (accuracy, recall, precision, f1) from a 2×2 confusion matrix."""
    tp, tn = cm[1, 1], cm[0, 0]
    fp, fn = cm[0, 1], cm[1, 0]
    acc = (tp + tn) / np.sum(cm)
    rec = tp / (tp + fn)
    prec = tp / (tp + fp)
    f1 = 2 * tp / (2 * tp + fp + fn)
    return float(acc), float(rec), float(prec), float(f1)


def plot_confusion_matrix(
    cm: np.ndarray,
    classes: list[str],
    normalize: bool = False,
    title: str = "Confusion matrix",
    fig_size: int = 8,
) -> None:
    if normalize:
        cm = cm.astype(float) / cm.sum(axis=1)[:, np.newaxis]

    plt.figure(figsize=(fig_size, fig_size))
    plt.imshow(cm, interpolation="nearest", cmap=plt.cm.Blues)
    plt.title(title)
    plt.colorbar()
    tick_marks = np.arange(len(classes))
    plt.xticks(tick_marks, classes, rotation=90)
    plt.yticks(tick_marks, classes)
    plt.tight_layout()
    plt.ylabel("True label")
    plt.xlabel("Predicted label")

    fmt = ".2f" if normalize else "d"
    thresh = cm.max() / 2.0
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            plt.text(
                j, i, format(cm[i, j], fmt),
                ha="center", va="center",
                color="white" if cm[i, j] > thresh else "black",
            )
    plt.show()


def plot_roc(y_true, y_pred_prob, show: bool = True) -> float:
    fpr, tpr, _ = metrics.roc_curve(y_true, y_pred_prob)
    auc = metrics.auc(fpr, tpr)
    if show:
        plt.figure()
        plt.plot(fpr, tpr, "black", label=f"AUC = {auc:.2f}")
        plt.plot([0, 1], [0, 1], "gray", linestyle="--")
        plt.xlim([0, 1])
        plt.ylim([0, 1])
        plt.xlabel("False Positive Rate")
        plt.ylabel("True Positive Rate")
        plt.legend(loc="lower right")
        plt.show()
    return auc


def plot_precision_recall(y_true, y_pred_prob, show: bool = True) -> tuple[float, float]:
    precision, recall, threshold = metrics.precision_recall_curve(y_true, y_pred_prob)
    f1 = 2 * (precision * recall) / (precision + recall)
    best_threshold = float(threshold[np.argmax(f1)])
    avg_precision = metrics.average_precision_score(y_true, y_pred_prob)

    if show:
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))
        ax1.step(recall, precision, color="b", alpha=0.2, where="post")
        ax1.fill_between(recall, precision, alpha=0.2, color="b", step="post")
        ax1.set_xlabel("Recall")
        ax1.set_ylabel("Precision")
        ax1.set_title(f"Precision-Recall (AP={avg_precision:.2f})")

        ax2.plot(threshold, precision[:-1], "b-", label="Precision")
        ax2.plot(threshold, recall[:-1], "g-", label="Recall")
        ax2.plot(threshold, f1[:-1], "r-", label="F1")
        ax2.axvline(x=best_threshold, color="r", linestyle="--", label=f"Th={best_threshold:.2f}")
        ax2.set_xlabel("Decision Threshold")
        ax2.legend(loc="best")
        plt.tight_layout()
        plt.show()

    return avg_precision, best_threshold
