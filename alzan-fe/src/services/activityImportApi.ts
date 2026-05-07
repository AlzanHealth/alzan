import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { CONFIG } from '../constants/environment';

interface BackendErrorResponse {
  message?: string;
}

export async function appendDocumentAsset(
  formData: FormData,
  fieldName: string,
  asset: DocumentPicker.DocumentPickerAsset,
) {
  const filename = deriveFilename(asset);
  const mimeType = asset.mimeType || 'application/octet-stream';

  if (Platform.OS === 'web') {
    const response = await fetch(asset.uri);
    if (!response.ok) throw new Error('ACTIVITY_IMPORT_FILE_READ_ERROR');
    const blob = await response.blob();
    formData.append(fieldName, blob, filename);
    return;
  }

  formData.append(fieldName, {
    uri: asset.uri,
    name: filename,
    type: mimeType,
  } as unknown as Blob);
}

export async function postActivityImportForm<TResponse>(
  path: string,
  token: string,
  formData: FormData,
): Promise<TResponse> {
  const response = await fetch(`${CONFIG.alzanBeBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const responseText = await response.text();
  console.log(`Backend returned status ${response.status}. Body: ${responseText}`);

  if (!response.ok) {
    let message = `HTTP_${response.status}`;
    try {
      const body = JSON.parse(responseText) as BackendErrorResponse;
      message = body.message || message;
    } catch {
      // Ignore
    }
    throw new Error(message);
  }

  return JSON.parse(responseText) as TResponse;
}

function deriveFilename(asset: DocumentPicker.DocumentPickerAsset): string {
  if (asset.name && asset.name.trim().length > 0) return asset.name;
  const uriTail = asset.uri.split('/').pop();
  if (!uriTail) return 'activity-import.fit';
  const decoded = decodeURIComponent(uriTail).trim();
  return decoded.length > 0 ? decoded : 'activity-import.fit';
}
