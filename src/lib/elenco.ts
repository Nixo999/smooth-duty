/** Come si legge un elenco di nomi incollato da qualche parte.
 *
 *  Sta in un file suo, senza "server-only", perche' serve identico da tutte e
 *  due le parti: al browser per mostrare l'anteprima mentre si scrive, al
 *  server per creare davvero le persone. Due implementazioni diverse
 *  vorrebbero dire un'anteprima che promette dodici nomi e un salvataggio che
 *  ne crea undici. */
export function nomiDaElenco(elenco: string): string[] {
  return [
    ...new Set(
      elenco
        // Virgole, punti e virgola, tabulazioni o a capo: chi incolla un
        // elenco lo ha copiato da qualche parte, e non si sa da dove.
        .split(/[,;\n\r\t]+/)
        .map((n) => n.trim().replace(/\s+/g, " "))
        .filter((n) => n.length >= 2),
    ),
  ];
}
