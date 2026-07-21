const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const publicDirectory = path.join(root, "apps", "desktop", "public");
const sourcePath = path.join(publicDirectory, "app-icon.svg");
const iconSizes = [16, 24, 32, 48, 64, 128, 256];

function createIco(pngImages) {
  const directorySize = 6 + pngImages.length * 16;
  const header = Buffer.alloc(directorySize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngImages.length, 4);

  let offset = directorySize;
  pngImages.forEach(({ size, data }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });

  return Buffer.concat([header, ...pngImages.map(({ data }) => data)]);
}

app.whenReady().then(async () => {
  const source = fs.readFileSync(sourcePath, "utf8");
  const renderer = new BrowserWindow({
    width: 512,
    height: 512,
    useContentSize: true,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
  });
  const document = `<!doctype html><html><head><style>html,body{width:512px;height:512px;margin:0;overflow:hidden;background:transparent}svg{display:block;width:512px;height:512px}</style></head><body>${source}</body></html>`;
  await renderer.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(document)}`);
  const image = await renderer.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  renderer.destroy();
  if (image.isEmpty()) throw new Error("Electron could not render app-icon.svg.");

  const pngImages = iconSizes.map((size) => ({
    size,
    data: image.resize({ width: size, height: size, quality: "best" }).toPNG(),
  }));
  const png512 = image.resize({ width: 512, height: 512, quality: "best" }).toPNG();
  const png256 = pngImages.find(({ size }) => size === 256).data;

  fs.writeFileSync(path.join(publicDirectory, "app-icon.png"), png512);
  fs.writeFileSync(path.join(publicDirectory, "app-icon-256.png"), png256);
  fs.writeFileSync(path.join(publicDirectory, "app-icon.ico"), createIco(pngImages));
  console.log(`Generated PNG and ${pngImages.length}-layer ICO assets from ${sourcePath}`);
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
