import UTIF from "utif";

/**
 * Processes an uploaded image File object (PNG, JPG, TIF, TIFF).
 * Browser engines cannot render TIFF images natively. This function
 * uses UTIF to decode TIFF bytes client-side, renders them to an offscreen
 * canvas, and creates a PNG Blob Object URL that browsers can render natively
 * in <img> and <canvas> tags.
 */
export function processImageFile(file, type) {
  const isTiff = /\.tiff?$/i.test(file.name);

  if (isTiff) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const buffer = e.target.result;
          const ifds = UTIF.decode(buffer);
          if (!ifds || ifds.length === 0) throw new Error("No TIFF IFDs found");
          const page = ifds[0];
          UTIF.decodeImage(buffer, page);
          const rgba = UTIF.toRGBA8(page);
          const width = page.width;
          const height = page.height;

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          const imgData = ctx.createImageData(width, height);
          imgData.data.set(rgba);
          ctx.putImageData(imgData, 0, 0);

          canvas.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              resolve({
                id: file.name,
                filename: file.name,
                type,
                width,
                height,
                thumbnail: url,
                uploadedAt: new Date().toISOString(),
              });
              return;
            }
            fallbackStandardLoad(file, type, resolve);
          }, "image/png");
        } catch (err) {
          console.warn("TIFF decoding warning, falling back:", err);
          fallbackStandardLoad(file, type, resolve);
        }
      };
      reader.onerror = () => fallbackStandardLoad(file, type, resolve);
      reader.readAsArrayBuffer(file);
    });
  }

  return new Promise((resolve) => {
    fallbackStandardLoad(file, type, resolve);
  });
}

function fallbackStandardLoad(file, type, resolve) {
  const url = URL.createObjectURL(file);
  const img = new window.Image();
  img.onload = () => {
    resolve({
      id: file.name,
      filename: file.name,
      type,
      width: img.naturalWidth,
      height: img.naturalHeight,
      thumbnail: url,
      uploadedAt: new Date().toISOString(),
    });
  };
  img.onerror = () => {
    resolve({
      id: file.name,
      filename: file.name,
      type,
      width: 1024,
      height: 1024,
      thumbnail: url,
      uploadedAt: new Date().toISOString(),
    });
  };
  img.src = url;
}
