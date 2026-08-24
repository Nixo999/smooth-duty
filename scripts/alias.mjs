/** Insegna a Node l'alias "@/" del progetto, che altrimenti conosce solo
 *  TypeScript. Serve per far girare gli script di prova direttamente sui
 *  sorgenti, senza compilare. */
import { register } from "node:module";
register("./alias-hook.mjs", import.meta.url);
