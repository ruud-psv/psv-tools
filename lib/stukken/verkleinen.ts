import sharp from "sharp";
import type { BeeldSoort } from "./afbeelding";

/**
 * Een foto klaarmaken voor een stuk: rechtop zetten (de draaiing uit de
 * camera, EXIF) en verkleinen tot hooguit 2560 px aan de langste kant. Dat is
 * scherp genoeg om schermvullend te presenteren op een 4K-scherm (een slide
 * is 1280 breed, een foto vult er hooguit de hele breedte van), zonder
 * bestanden van tientallen megabytes in een deck. Kleiner wordt nooit groter
 * gemaakt. Foto's worden JPEG (kwaliteit 88); met doorzichtigheid blijft het PNG.
 */

export const MAX_ZIJDE = 2560;

export async function verkleinVoorStuk(bytes: Uint8Array): Promise<{ bytes: Uint8Array; soort: BeeldSoort }> {
  const beeld = sharp(bytes, { failOn: "none" }).rotate();
  const { hasAlpha } = await beeld.metadata();
  const verkleind = beeld.resize({ width: MAX_ZIJDE, height: MAX_ZIJDE, fit: "inside", withoutEnlargement: true });
  if (hasAlpha) {
    return { bytes: new Uint8Array(await verkleind.png({ compressionLevel: 9 }).toBuffer()), soort: "png" };
  }
  return { bytes: new Uint8Array(await verkleind.jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: "4:4:4" }).toBuffer()), soort: "jpg" };
}
