import torch
import numpy as np
from PIL import Image
import base64
import io

class ImageComparePro:
    
    CATEGORY = "mmmmmmmmm"
    RETURN_TYPES = ()
    FUNCTION = "prepare_images_for_comparison"
    OUTPUT_NODE = True

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image_a": ("IMAGE",),
                "image_b": ("IMAGE",),
            }
        }

    def prepare_images_for_comparison(self, image_a, image_b):

        """main: image transfer/encode and return to JS"""
        # 1. image tensor → image PIL
        pil_imgA = self._tensor_to_pil(image_a)
        pil_imgB = self._tensor_to_pil(image_b)

        # 2. image PIL → Base64
        imgA_b64 = self._pil_to_base64(pil_imgA)
        imgB_b64 = self._pil_to_base64(pil_imgB)

        # 3. clean up
        self._cleanup_memory([pil_imgA, pil_imgB])

        # 4. return to JS
        return {
            "result": (),
            "ui": {
                "b64_a": imgA_b64,
                "b64_b": imgB_b64,
            }
        }
    
    def _tensor_to_pil(self, tensor: torch.Tensor) -> Image.Image:

        """image tensor [Batch, H, W, C] encode to PIL"""
        # take the first from the batch
        numpy_image = tensor.cpu().numpy()[0]
        # transfer to 0-255
        numpy_image = (numpy_image * 255).astype(np.uint8)
        # generate PIL
        pil_image = Image.fromarray(numpy_image)
        return pil_image

    def _pil_to_base64(self, pil_image: Image.Image) -> str:
        """PIL → Base64"""
        buffer = io.BytesIO()
        pil_image.save(buffer, format="PNG")
        base64_str = base64.b64encode(buffer.getvalue()).decode("utf-8")
        return base64_str

    def _cleanup_memory(self, images: list[Image.Image]):
        for img in images:
            try:
                img.close()
            except Exception:
                pass

NODE_CLASS_MAPPINGS = {
    "ImageComparePro": ImageComparePro
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ImageComparePro": "Image Compare Pro"
}