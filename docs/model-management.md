# AI Model Management System

## Overview

This document describes the AI model management system that allows users to download, select, and manage multiple on-device AI models.

## Features

✅ **Multiple Model Support**: Registry of 6 models (1 available, 5 coming soon)
✅ **Model Download**: In-app download with progress tracking
✅ **Model Selection**: Switch between models with automatic service reload
✅ **Model Removal**: Delete models to free up storage
✅ **Organized Storage**: Each model in its own folder
✅ **Database Persistence**: Track downloaded and selected models
✅ **Rich UI**: Beautiful model cards with metadata and status

## Architecture

### 1. Model Registry (`lib/ai/modelConfig.ts`)

Defines all available models with their configuration:

```typescript
export const ALL_MODELS: LlmModelConfig[] = [
  Llama32_1B_Instruct,      // ✅ Available
  GLM4_9B_Chat,             // 🚧 Coming soon
  GLMEdge_V_5B,             // 🚧 Coming soon
  DeepSeekR1_Qwen3_8B,      // 🚧 Coming soon
  DeepSeekR1_Distill_Qwen_14B, // 🚧 Coming soon
  DeepSeekVL2_Tiny,         // 🚧 Coming soon
];
```

Each model includes:
- **modelId**: Unique identifier
- **displayName**: Human-readable name
- **description**: What the model is good for
- **size**: Parameter count (1B, 8B, 14B, etc.)
- **quantization**: Quantization method (SpinQuant, 4-bit, etc.)
- **folderName**: Storage directory name
- **pteFileName**: ExecuTorch PTE file
- **tokenizerFileName**: Tokenizer file
- **available**: Whether PTE files exist
- **huggingFaceUrl**: Link to model page

### 2. Model Settings Database (`lib/db/modelSettings.ts`)

Stores model state in SQLite:

```typescript
interface ModelSettings {
  selectedModelId: string;
  downloadedModels: ModelDownloadInfo[];
}

interface ModelDownloadInfo {
  modelId: string;
  downloadedAt: number;
  ptePath: string;
  tokenizerPath?: string;
  tokenizerConfigPath?: string;
  size: number;
}
```

Repository methods:
- `getSelectedModelId()` - Get active model
- `setSelectedModelId(id)` - Set active model
- `addDownloadedModel(info)` - Record download
- `removeDownloadedModel(id)` - Remove model record
- `isModelDownloaded(id)` - Check download status

### 3. Model Manager (`lib/ai/modelManager.ts`)

Handles file operations:

```typescript
// Download model files to device
ensureModelPresent(config: LlmModelConfig): Promise<EnsureResult>

// Delete model folder
deleteModel(config: LlmModelConfig): Promise<void>

// Get model size in bytes
getModelSize(config: LlmModelConfig): Promise<number>
```

Storage structure:
```
documents/models/
├── llama-3.2-1b-instruct/
│   ├── llama3_2_spinquant.pte
│   ├── tokenizer.json
│   └── tokenizer_config.json
└── {model-id}/
    └── ...
```

### 4. Model Provider (`lib/ai/ModelProvider.tsx`)

React context for model initialization and verification:

```typescript
interface ModelContextValue {
  reloadModel: (config: LlmModelConfig) => Promise<void>;
  currentConfig: LlmModelConfig;
}

// Usage
const { reloadModel, currentConfig } = useModel();
await reloadModel(newModelConfig);
```

The provider handles:
- Model initialization on app startup
- Verification that downloaded models still exist on disk
- Cleanup of stale download state
- Providing model config context for settings UI

Note: Actual LLM loading and generation is handled by `LLMProvider`.

### 5. Model Management UI (`lib/components/ModelManagement.tsx`)

User interface for model management:

**Features:**
- List all available models
- Show download status and size
- Display model metadata (size, quantization)
- Download button for available models
- Select button to switch models
- Remove button to delete models
- Link to HuggingFace model pages
- Loading states and error handling

**Model Card UI:**
- Title with SELECTED badge
- Metadata badges (size, quantization, availability)
- Description text
- Downloaded size display
- Action buttons (Download, Select, Remove)
- HuggingFace link
- Unavailable model message

### 6. Download Script (`scripts/downloadModels.ts`)

CLI tool for development:

```bash
# Download default model (Llama 3.2 1B)
pnpm download:models

# Download specific model
pnpm download:models --model llama-3.2-1b-instruct

# Download all available models
pnpm download:models --all
```

## User Flow

### Downloading a Model

1. User opens **Settings > AI Models**
2. Sees list of available models
3. Taps **Download** on a model
4. Progress indicator shows download
5. Model is saved to device storage
6. Database records download info
7. Model card updates to show downloaded status

### Selecting a Model

1. User taps **Select** on a downloaded model
2. Alert confirms model selection
3. Database updates `selectedModelId`
4. Model becomes active on next app restart or LLM reload
5. Success message confirms activation
6. Model is ready for use

### Removing a Model

1. User taps **Remove** on a downloaded model
2. Confirmation dialog appears
3. User confirms removal
4. Model files deleted from device
5. Database removes download record
6. If removed model was selected, switches to default
7. Model card updates to show not downloaded

## Model States

| State | Downloaded | Selected | Actions Available |
|-------|-----------|----------|-------------------|
| **Not Downloaded (Available)** | ❌ | ❌ | Download, View Details |
| **Not Downloaded (Unavailable)** | ❌ | ❌ | View Details |
| **Downloaded** | ✅ | ❌ | Select, Remove, View Details |
| **Selected** | ✅ | ✅ | Remove (disabled), View Details |

## Model Registry

All models are from [Software Mansion's React Native ExecuTorch repositories](https://huggingface.co/software-mansion) and are available for immediate download.

### Llama 3.2 Models (SpinQuant Quantization)

#### Llama 3.2 1B Instruct
- **Model ID**: `llama-3.2-1b-instruct`
- **Size**: 1B parameters
- **Quantization**: SpinQuant
- **File Size**: ~800MB
- **Description**: Fast and efficient model optimized for on-device inference. Great for quick responses and everyday tasks.
- **Status**: ✅ Available
- **Source**: [software-mansion/react-native-executorch-llama-3.2](https://huggingface.co/software-mansion/react-native-executorch-llama-3.2)

#### Llama 3.2 3B Instruct
- **Model ID**: `llama-3.2-3b-instruct`
- **Size**: 3B parameters
- **Quantization**: SpinQuant
- **File Size**: ~2.5GB
- **Description**: Higher quality model with improved reasoning and understanding. Better for complex tasks.
- **Status**: ✅ Available
- **Source**: [software-mansion/react-native-executorch-llama-3.2](https://huggingface.co/software-mansion/react-native-executorch-llama-3.2)

### Qwen 3 Models (8-bit Quantization)

#### Qwen 3 0.6B
- **Model ID**: `qwen-3-0.6b`
- **Size**: 0.6B parameters
- **Quantization**: 8-bit (8da4w)
- **File Size**: ~600MB
- **Description**: Compact and ultra-efficient model. Smallest option with fastest inference speed.
- **Status**: ✅ Available
- **Source**: [software-mansion/react-native-executorch-qwen-3](https://huggingface.co/software-mansion/react-native-executorch-qwen-3)

#### Qwen 3 1.7B
- **Model ID**: `qwen-3-1.7b`
- **Size**: 1.7B parameters
- **Quantization**: 8-bit (8da4w)
- **File Size**: ~1.7GB
- **Description**: Balanced model offering good quality with reasonable speed. Great all-around choice.
- **Status**: ✅ Available
- **Source**: [software-mansion/react-native-executorch-qwen-3](https://huggingface.co/software-mansion/react-native-executorch-qwen-3)

#### Qwen 3 4B
- **Model ID**: `qwen-3-4b`
- **Size**: 4B parameters
- **Quantization**: 8-bit (8da4w)
- **File Size**: ~4GB
- **Description**: Powerful model with excellent reasoning and understanding. Best quality for on-device inference.
- **Status**: ✅ Available
- **Source**: [software-mansion/react-native-executorch-qwen-3](https://huggingface.co/software-mansion/react-native-executorch-qwen-3)

## Technical Details

### Model Source Types

```typescript
type ModelSource =
  | { kind: "bundled"; requireId: any }
  | { kind: "remote"; url: string }
  | { kind: "unavailable"; reason: string };
```

- **bundled**: Model files packaged with app
- **remote**: Download from URL (HuggingFace)
- **unavailable**: Not yet available (shows reason)

### Storage Locations

**Development (assets/):**
```
assets/models/{model-id}/
├── {model}.pte
├── tokenizer.json
└── tokenizer_config.json
```

**Runtime (documents/):**
```
{documents}/models/{model-id}/
├── {model}.pte
├── tokenizer.json
└── tokenizer_config.json
```

### Model Loading Priority

1. Check documents directory for existing files
2. If not found and source is "bundled", try bundled assets
3. If not found and source is "remote", download from URL
4. If source is "unavailable", throw error with reason

### Error Handling

- **Download fails**: Show alert, don't update database
- **Model unavailable**: Show message in card, disable download
- **Selection fails**: Show alert, don't update selection
- **Remove fails**: Show alert, don't delete files

## Future Enhancements

### Planned Features

1. **Download Progress**: Real-time progress bar during download
2. **Model Validation**: Verify checksums after download
3. **Automatic Updates**: Check for model updates
4. **Storage Management**: Show total storage used
5. **Model Benchmarks**: Display performance metrics
6. **Multiple Model Loading**: Load models in background
7. **Model Preloading**: Preload models for faster switching

### Model Conversion Guide

To add support for new models:

1. **Convert to ExecuTorch PTE**:
   ```bash
   # Export model to ExecuTorch format
   python -m examples.models.llama.export_llama \
     --checkpoint <model_checkpoint> \
     --output model.pte
   ```

2. **Add to Registry** (`modelConfig.ts`):
   ```typescript
   export const NewModel: LlmModelConfig = {
     modelId: "new-model-id",
     displayName: "New Model",
     description: "Model description",
     size: "8B",
     quantization: "4-bit",
     folderName: "new-model-id",
     pteFileName: "new_model.pte",
     available: true,
     pteSource: { kind: "remote", url: "..." },
     // ...
   };
   ```

3. **Add to Download Script** (`downloadModels.ts`):
   ```typescript
   {
     modelId: "new-model-id",
     displayName: "New Model",
     folderName: "new-model-id",
     available: true,
     files: [
       { url: "...", filename: "new_model.pte", description: "..." },
       { url: "...", filename: "tokenizer.json", description: "..." },
     ]
   }
   ```

4. **Test**:
   - Download with CLI: `pnpm download:models --model new-model-id`
   - Download in app: Settings > AI Models > Download
   - Select model and test generation

## References

- [ExecuTorch Documentation](https://pytorch.org/executorch/)
- [Model Config](../lib/ai/modelConfig.ts)
- [Model Manager](../lib/ai/modelManager.ts)
- [Model Provider](../lib/ai/ModelProvider.tsx)
- [Model Management UI](../lib/components/ModelManagement.tsx)
- [Download Script](../scripts/downloadModels.ts)

## Support

For issues with:
- **Model download**: Check network connection and storage space
- **Model selection**: Ensure model is downloaded first
- **Model availability**: Check HuggingFace for PTE files
- **App crashes**: Check logs for model loading errors

## Notes

✅ **All Models Available**: All 5 models have ExecuTorch PTE files and can be downloaded directly to phones.

📦 **Storage**: Models range from 600MB to 4GB. Ensure device has sufficient storage before downloading.

🚀 **Production Ready**: All models are from Software Mansion's official ExecuTorch repositories and tested for mobile deployment.

⚖️ **Model Selection Guide**:
- **Fastest**: Qwen 3 0.6B (~600MB)
- **Balanced**: Llama 3.2 1B or Qwen 3 1.7B (~800MB - 1.7GB)
- **Best Quality**: Llama 3.2 3B or Qwen 3 4B (~2.5GB - 4GB)

