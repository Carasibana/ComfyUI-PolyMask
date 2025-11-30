# ComfyUI-PolyMask

A ComfyUI custom node for creating polygon masks directly in the workflow editor.

![Demo](screenshots/demo.png)

## Features

- **Poly Mask Loader** - Single polygon mask creation
- **Poly Mask Loader (Multi)** - Up to 6 polygon masks combined into one

### Controls

| Action | Result |
|--------|--------|
| Left click on canvas | Add point |
| Left click + drag point | Move point |
| Left click on line | Insert new point |
| Right click on point | Delete point |

### Parameters

- **Feathering** - Blur/soften mask edges (0-100)

## Installation

### Option 1: Git Clone

```bash
cd ComfyUI/custom_nodes/
git clone https://github.com/Carasibana/ComfyUI-PolyMask.git
```

### Option 2: Download ZIP

1. Download the repository as ZIP
2. Extract to `ComfyUI/custom_nodes/ComfyUI-PolyMask`

Then restart ComfyUI.

## Usage

Find the nodes under the **image** category:

- `Poly Mask Loader` - For single polygon masks
- `Poly Mask Loader (Multi)` - For multiple polygon masks (up to 6)

## License

MIT License - see [LICENSE](LICENSE) for details.

## Author

[Carasibana](https://github.com/Carasibana)