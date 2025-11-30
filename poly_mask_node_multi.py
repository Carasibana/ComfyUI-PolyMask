import os
import json
import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFilter
import folder_paths

class PolyMaskNodeMulti:
    """
    Load an image and create multiple polygonal masks by placing points interactively.
    """
    
    CATEGORY = "image"
    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("IMAGE", "MASK")
    FUNCTION = "load_image_and_mask"
    
    @classmethod
    def INPUT_TYPES(cls):
        input_dir = folder_paths.get_input_directory()
        files = []
        for f in os.listdir(input_dir):
            if f.endswith(('.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif')):
                files.append(f)
        
        return {
            "required": {
                "image": (sorted(files), {"image_upload": True}),
                "feathering": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 100,
                    "step": 1,
                    "display": "slider"
                }),
                "polygon_data": ("STRING", {"default": "[]", "multiline": False}),
            },
        }
    
    @classmethod
    def IS_CHANGED(cls, image, feathering, polygon_data="[]"):
        image_path = folder_paths.get_annotated_filepath(image)
        m_time = os.path.getmtime(image_path)
        return f"{image}_{m_time}_{feathering}_{polygon_data}"
    
    @classmethod
    def VALIDATE_INPUTS(cls, image, feathering, polygon_data="[]"):
        if not folder_paths.exists_annotated_filepath(image):
            return f"Invalid image file: {image}"
        return True
    
    def load_image_and_mask(self, image, feathering, polygon_data="[]"):
        image_path = folder_paths.get_annotated_filepath(image)
        img = Image.open(image_path)
        
        img = self._apply_exif_orientation(img)
        
        if img.mode == 'RGBA':
            background = Image.new('RGB', img.size, (255, 255, 255))
            background.paste(img, mask=img.split()[3])
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')
        
        img_array = np.array(img).astype(np.float32) / 255.0
        img_tensor = torch.from_numpy(img_array).unsqueeze(0)
        
        try:
            polygons = json.loads(polygon_data)
        except json.JSONDecodeError:
            polygons = []
        
        width, height = img.size
        mask_array = self._create_combined_mask(width, height, polygons, feathering)
        
        mask_tensor = torch.from_numpy(mask_array).unsqueeze(0)
        
        return (img_tensor, mask_tensor)
    
    def _apply_exif_orientation(self, img):
        try:
            from PIL import ExifTags
            exif = img._getexif()
            if exif is not None:
                for tag, value in exif.items():
                    if ExifTags.TAGS.get(tag) == 'Orientation':
                        if value == 3:
                            img = img.rotate(180, expand=True)
                        elif value == 6:
                            img = img.rotate(270, expand=True)
                        elif value == 8:
                            img = img.rotate(90, expand=True)
                        break
        except (AttributeError, KeyError, IndexError):
            pass
        return img
    
    def _create_combined_mask(self, width, height, polygons, feather_amount):
        # Start with empty mask
        combined_mask = np.zeros((height, width), dtype=np.float32)
        
        for polygon_obj in polygons:
            points = polygon_obj.get('points', [])
            # Only include polygons with 3+ points
            if len(points) >= 3:
                mask_img = Image.new('L', (width, height), 0)
                draw = ImageDraw.Draw(mask_img)
                polygon_coords = [(p['x'], p['y']) for p in points]
                draw.polygon(polygon_coords, fill=255)
                
                mask_array = np.array(mask_img).astype(np.float32) / 255.0
                combined_mask = np.maximum(combined_mask, mask_array)
        
        # If no valid polygons, return all white (no mask)
        if combined_mask.max() == 0:
            return np.ones((height, width), dtype=np.float32)
        
        # Apply feathering to combined mask
        if feather_amount > 0:
            combined_img = Image.fromarray((combined_mask * 255).astype(np.uint8), mode='L')
            blurred_img = combined_img.filter(ImageFilter.GaussianBlur(radius=feather_amount))
            blurred_array = np.array(blurred_img).astype(np.float32) / 255.0
            combined_mask = np.maximum(combined_mask, blurred_array)
        
        return combined_mask