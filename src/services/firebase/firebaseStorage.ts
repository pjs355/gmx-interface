import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

export interface UploadResult {
  url: string;
  filename: string;
}

export async function uploadImageToFirebase(
  file: File,
  path: string,
  onProgress?: (progress: number) => void
): Promise<UploadResult> {
  try {
    // Create a reference to the file location
    const storageRef = ref(storage, path);

    // Upload the file
    const snapshot = await uploadBytes(storageRef, file);

    // Get the download URL
    const downloadURL = await getDownloadURL(snapshot.ref);

    return {
      url: downloadURL,
      filename: snapshot.ref.name,
    };
  } catch (error) {
    console.error("Error uploading file:", error);
    throw new Error(`Failed to upload image: ${error}`);
  }
}

export async function uploadUmbrellaImage(
  file: File,
  umbrellaId: string,
  imageType: "banner" | "square",
  onProgress?: (progress: number) => void
): Promise<UploadResult> {
  // Generate unique filename
  const fileExtension = file.name.split(".").pop();
  const filename = imageType === "banner" ? `b_${umbrellaId}.${fileExtension}` : `ic_${umbrellaId}.${fileExtension}`;

  // Upload to Firebase Storage
  const path = `umbrellas/${filename}`;
  return await uploadImageToFirebase(file, path, onProgress);
}

export async function uploadTagImage(
  file: File,
  slug: string,
  onProgress?: (progress: number) => void
): Promise<UploadResult> {
  // Generate filename with tag- prefix and slug
  const fileExtension = file.name.split(".").pop();
  const filename = `tag-${slug}.${fileExtension}`;

  // Upload to Firebase Storage in tags folder
  const path = `tags/${filename}`;
  return await uploadImageToFirebase(file, path, onProgress);
}
