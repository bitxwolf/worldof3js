import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useWorldStore } from '../../store/worldStore';

export type ImageTag = 'character' | 'scene' | 'texture';

export interface UploadedImage {
  base64: string;
  mimeType: string;
  tag: ImageTag;
  preview: string;
}

export interface ImageUploaderProps {
  onImagesChange: (images: UploadedImage[]) => void;
  onDone?: () => void;
  onClose?: () => void;
}

export const ImageUploader = ({
  onImagesChange,
  onDone,
  onClose,
}: ImageUploaderProps) => {
  const [images, setImages] = useState<UploadedImage[]>(() => {
    const storeImages = useWorldStore.getState().uploadedImages || [];
    return storeImages.map((img) => ({
      base64: img.base64,
      mimeType: img.mimeType,
      tag: (img.tag as ImageTag) || 'character',
      preview: img.base64.startsWith('data:')
        ? img.base64
        : `data:${img.mimeType || 'image/png'};base64,${img.base64}`,
    }));
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = useCallback(
    async (files: FileList) => {
      const newImages: UploadedImage[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const base64 = await fileToBase64(file);
        newImages.push({
          base64,
          mimeType: file.type,
          tag: 'character',
          preview: URL.createObjectURL(file),
        });
      }
      const updated = [...images, ...newImages];
      setImages(updated);
      onImagesChange(updated);
    },
    [images, onImagesChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const handleTagChange = useCallback(
    (index: number, tag: ImageTag) => {
      const updated = images.map((img, i) => (i === index ? { ...img, tag } : img));
      setImages(updated);
      onImagesChange(updated);
    },
    [images, onImagesChange]
  );

  const handleRemove = useCallback(
    (index: number) => {
      if (images[index]?.preview?.startsWith('blob:')) {
        URL.revokeObjectURL(images[index].preview);
      }
      const updated = images.filter((_, i) => i !== index);
      setImages(updated);
      onImagesChange(updated);
    },
    [images, onImagesChange]
  );

  const imagesRef = useRef(images);
  imagesRef.current = images;

  useEffect(() => {
    return () => {
      imagesRef.current.forEach((img) => {
        if (img.preview?.startsWith('blob:')) {
          URL.revokeObjectURL(img.preview);
        }
      });
    };
  }, []);

  const handleDismiss = useCallback(() => {
    if (onDone) {
      onDone();
    } else if (onClose) {
      onClose();
    }
  }, [onDone, onClose]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-gray-200">Upload Images</label>
        {(onDone || onClose) && (
          <button
            type="button"
            onClick={handleDismiss}
            className="px-2.5 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white font-medium transition cursor-pointer"
          >
            Done
          </button>
        )}
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-gray-700 hover:border-indigo-500 rounded-xl p-4 text-center cursor-pointer transition-colors"
      >
        <div className="text-gray-400 text-xs">📷 Drag & drop images or click to browse</div>
        <div className="text-[10px] text-gray-500 mt-1">PNG, JPG, WebP · Character portraits, scene art, textures</div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          className="hidden"
        />
      </div>

      {images.length > 0 && (
        <div className="space-y-2">
          {images.map((img, i) => (
            <div key={i} className="flex items-center gap-3 bg-gray-900 rounded-lg p-2 border border-gray-800">
              <img src={img.preview} alt="Preview" className="w-10 h-10 rounded object-cover" />
              <select
                value={img.tag}
                onChange={(e) => handleTagChange(i, e.target.value as ImageTag)}
                className="bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200"
              >
                <option value="character">👤 Character</option>
                <option value="scene">🏞️ Scene</option>
                <option value="texture">🧱 Texture</option>
              </select>
              <button
                type="button"
                onClick={() => handleRemove(i)}
                className="ml-auto text-gray-400 hover:text-red-400 text-xs"
              >
                ✕
              </button>
            </div>
          ))}
          {(onDone || onClose) && (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleDismiss}
                className="w-full py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition cursor-pointer text-center"
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] || result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
