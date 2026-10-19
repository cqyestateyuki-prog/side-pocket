// Plus Jakarta Sans from the product's own font files; rendering waits until it has loaded.
import { continueRender, delayRender, staticFile } from "remotion";

const handle = delayRender("Plus Jakarta Sans");
const faces = ["latin", "latin-ext"].map(
  (sub) =>
    new FontFace("Plus Jakarta Sans", `url(${staticFile(`fonts/PlusJakartaSans-VF-${sub}.woff2`)}) format("woff2")`, {
      weight: "200 800",
    }),
);
Promise.all(faces.map((f) => f.load()))
  .then((loaded) => {
    loaded.forEach((f) => document.fonts.add(f));
    continueRender(handle);
  })
  .catch((err) => {
    console.error(err);
    continueRender(handle);
  });
