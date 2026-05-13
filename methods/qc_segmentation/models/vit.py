"""ViT-B/16 backbone with an appended area feature for quality classification.

Attribute names (vit_model, fc) match the original training checkpoint so
that weights load without any key remapping.
"""

import torch
import torch.nn as nn
from torchvision.models import vit_b_16, ViT_B_16_Weights


class ViTWithArea(nn.Module):
    """ViT-B/16 that concatenates a scalar area feature before the final head.

    Args:
        n_classes: Number of output classes (default 2: correct / incorrect).
        pretrained: Load ImageNet weights for the ViT backbone.
    """

    def __init__(self, n_classes: int = 2, pretrained: bool = True):
        super().__init__()
        weights = ViT_B_16_Weights.IMAGENET1K_V1 if pretrained else None
        vit_model = vit_b_16(weights=weights)
        vit_features: int = vit_model.heads.head.in_features
        vit_model.heads.head = nn.Identity()
        self.vit_model = vit_model
        self.fc = nn.Linear(vit_features + 1, n_classes)

    def forward(self, images: torch.Tensor, areas: torch.Tensor) -> torch.Tensor:
        """Forward pass.

        Args:
            images: (B, 3, 224, 224) float tensor, ImageNet-normalised.
            areas:  (B, 1) float tensor with the contour pixel area.

        Returns:
            (B, n_classes) logits.
        """
        features = self.vit_model(images)
        return self.fc(torch.cat([features, areas], dim=1))


def load_model(checkpoint_path: str, device: torch.device, n_classes: int = 2) -> ViTWithArea:
    """Load a saved ViTWithArea model from *checkpoint_path*.

    Args:
        checkpoint_path: Path to a ``.pth`` file saved with ``torch.save(model.state_dict(), ...)``.
        device: Target device.
        n_classes: Must match the value used during training.

    Returns:
        Model in eval mode on *device*.
    """
    model = ViTWithArea(n_classes=n_classes, pretrained=False)
    state = torch.load(checkpoint_path, map_location=device)
    model.load_state_dict(state)
    model.to(device)
    model.eval()
    return model
