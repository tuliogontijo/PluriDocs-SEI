import { getSeiVersion } from "../functions/functions.js"
import BotaoAcao from "../components/BotaoAcao.js"

/**
 * Arranjo para mostrar o botão somente quando o estiver na página inicial de um processo 
 */

setTimeout(() => {

  const isAnyDocOpen = getSeiVersion().startsWith("4.1") ? $(`#ifrVisualizacao[src^='controlador.php?acao=documento_visualizar']`)[0] : $('#ifrArvoreHtml')[0]

    !isAnyDocOpen &&
    !$(`img[alt='Reabrir Processo']`)[0] &&
    $(`img[alt='Concluir Processo']`)[0] &&
    BotaoAcao(chrome.runtime.getURL("src/img/btn.png"));

}, localStorage.getItem('seiSlim') ? 1000 : 300);







