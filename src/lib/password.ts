const WORDS = [
  "luna", "porto", "vento", "sabbia", "campo", "faro", "ponte", "riva",
  "monte", "prato", "aurora", "salice", "corallo", "nebbia",
];

/** Password provvisoria leggibile e pronunciabile: chi la consegna la deve
 *  dettare a voce o scrivere su un foglio, non incollarla. Vale finche' la
 *  persona non entra la prima volta, e li' l'app la obbliga a cambiarla. */
export function generatePassword() {
  const w = () => WORDS[Math.floor(Math.random() * WORDS.length)];
  return `${w()}-${w()}-${Math.floor(100 + Math.random() * 900)}`;
}
