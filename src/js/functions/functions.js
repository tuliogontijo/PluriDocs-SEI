import { normalChars, specialChars } from '../util/encodingTables.js';

let dataDocs = [];
let dynamicFields = [];
let CSVData = [];
let CSVHeaders = [];
let dataCrossing = []
let selectedModel = {};
let CSVFileName = '';
let docsNames = '';
let descricaoDoc = '';
let aborted = false;
let flagError = false;
let flagConfirmSpecialChars = false;
let forceNames = false;

export const setSeiVersion = () => {
  const logoSeiTitle = $(`img[title^=Sistema]`).attr('title').trim();
  const version = logoSeiTitle.substring(logoSeiTitle.lastIndexOf(" ") + 1, logoSeiTitle.length);

  localStorage.setItem('versaoSei', version);
}

export const getSeiVersion = () => {
  return localStorage.getItem('versaoSei');
}

const fillSelect = (select) => {
  let resultado = '';
  let contadorDocsValidos = 0;
  dataDocs.forEach((doc) => {
    if (doc.cancelado || doc.externo || !doc.src)
      resultado += `<option value="${doc.nome}" disabled title="Documento não válido para replicação em lote">${doc.nome}</option>`
    else {
      resultado += `<option value="${doc.nome}">${doc.nome}</option>`;
      contadorDocsValidos++;
    }
  })
  if (contadorDocsValidos === 0) {
    select.after(`<small class="noFieldsError">Não há documentos válidos para reprodução no processo<small>`);
  } else
    select.removeAttr('disabled');
  select.children().remove();
  select.append(resultado);
}

export const getDocsArvore = () => {

  const select = $('#docModelo select');
  $('#docModelo small').remove();//remoção de eventuais mensagens de erro residuais

  dataDocs = [];

  /* Loader de busca de documentos na árvore */
  select.children().remove();
  select.attr('disabled', 'disabled')
  let loadingText = 'Buscando documentos ';
  let counter = 0;

  select.append(`<option><span class="spin">${loadingText}</span></option>`)
  const addSymbol = () => {
    if (counter < 3) {
      loadingText += '🔍'
      counter++;
    }
    else {
      loadingText = 'Buscando documentos ';
      counter = 0;
    }
    select.find('option').text(loadingText);
  }
  const loadingInteval = setInterval(addSymbol, 200)

  /* Verifica se existe o botão (+) para expandir pastas na árvore */
  const urlBtnExpandirPastas = $("#ifrArvore").contents().find("[id^='anchorAP']").attr('href');
  const urlArvore = $("#ifrArvore").attr('src');

  const urlBusca = urlBtnExpandirPastas ? urlBtnExpandirPastas : urlArvore;


  $.get(urlBusca).done((htmlArvore) => {
    const lines = htmlArvore.split('\n');
    const pattern1 = /^Nos\[\d{1,}\] = new infraArvoreNo\("DOCUMENTO/i;
    const pattern2 = /^Nos\[\d{1,}\]\.src = 'controlador/

    lines.forEach((line) => {
      if (pattern1.test(line)) {
        const nrNo = line.substring(1, line.indexOf(']')).match(/\d{1,}/)[0];
        const props = line.slice(line.indexOf('(') + 1, line.lastIndexOf(')')).replaceAll(`"`, ``).replaceAll(`\\\\`).split(',');

        if (props[17])//documentos com vírgula têm quebra de linha por conta do split. Esta condição concatena as linhas quebradas
          dataDocs.push({
            nrNo,
            nome: `${props[5]},${props[6]}`,
            numero: props[17],
            cancelado: props[7].startsWith('Documento Cancelado') ? true : false,
            externo: props[9].includes('documento_interno') ? false : true
          });
        else
          dataDocs.push({
            nrNo,
            nome: props[5],
            numero: props[15],
            cancelado: props[6].startsWith('Documento Cancelado') ? true : false,
            externo: props[9].includes('documento_interno') ? false : true
          });
      }
    })

    lines.forEach((line) => {//Percorre o array novamente em busca dos links diretos para os documentos
      if (pattern2.test(line)) {
        const nrNo = line.substring(1, line.indexOf(']')).match(/\d{1,}/)[0];
        const src = line.substring(line.indexOf(`'`) + 1, line.lastIndexOf(`'`))
        const docMatched = dataDocs.find((dataDoc) => dataDoc.nrNo === nrNo);
        dataDocs[dataDocs.indexOf(docMatched)] = { ...docMatched, src };
      }
    })

    fillSelect(select);
    clearInterval(loadingInteval);//para o loader

  }).then(() => {
    $("#btnSelecaoDoc").prop('disabled', false).removeClass('ui-button-disabled ui-state-disabled');
  })
}

export const clearInputs = () => $('.ui-dialog input').each(function () { $(this).val('') })

export const docAnalysis = (protocolo) => {
  $('#fieldList').remove();
  dynamicFields = [];

  if (!$('#loaderAnalysis')[0])//Só o loader renderiza se já não existir
    $('#analiseDocModelo').append(`<span id='loaderAnalysis' class='ui-icon ui-icon-loading-status-balls spin loader-analise'></span>`);
  $("#btnConfirmAnalysis").prop('disabled', true).addClass('ui-button-disabled ui-state-disabled')//Desabilita Botão OK até o carregamento


  const selectedDoc = dataDocs.find((doc) => doc.numero === protocolo);

  $.get(selectedDoc.src).done((contentDoc) => {
    const body = contentDoc.substring(contentDoc.indexOf('<body>'), contentDoc.lastIndexOf('</body>'))
    const matches = Array.from(new Set(body.match(/##.+?##/gm)));//rearranjo para remover duplicatas
    fillModelAnalysis(matches, selectedDoc);
  }).then(() => {
    $("#loaderAnalysis").remove();
  })
}

const fillModelAnalysis = (matches, selectedDoc) => {

  selectedModel = selectedDoc;
  dynamicFields = matches.map((field) => field.trim());

  $('#analiseDocModelo').append(`<div id='fieldList'></div>`)
  $('#fieldList').append(`<p class="textAnalysis"><span class='ui-icon ui-icon-arrow-r'></span> Documento: ${selectedDoc.nome}</p>`)
  if (matches.length) {

    let lista = `<ul class="textAnalysis">\n`;
    matches.forEach((field) => {
      lista += `<li>${field.replaceAll('#', '')}</li>\n`
    })
    lista += '</ul>';
    $('#fieldList').append(`<p class="textAnalysis dFielTitle"><span class='ui-icon ui-icon-arrowreturn-1-s curvedArrow'></span> Campos dinâmicos detectados:</p>`)
    $('#fieldList').append(lista);
    $("#btnConfirmAnalysis").prop('disabled', false).removeClass('ui-button-disabled ui-state-disabled');
  } else {
    $('#fieldList').append(`<small class="noFieldsError">Não foi identificado nenhum campo dinâmico no documento modelo informado. Verifique se os mesmos foram redigidos corretamente com o padrão ##nome do campo##.</small>`)
  }

  adjustModalPosition('analiseDocModelo');

}

export const detectEncodingCSV = () => {
  $("#inputBD").on("change", function () {
    if ($(this)[0].files[0]) {
      const file = $(this)[0].files[0];
      const reader = new FileReader();
      reader.onload = function (e) {
        let csvResult = e.target.result.split(/\r|\n|\r\n/);
        $("#inputBD").attr('encoding', jschardet.detect(csvResult.toString()).encoding.toLowerCase());
      }

      reader.readAsBinaryString(file);
    }
  });
}

export const CSVAnalysis = (file) => {

  $('#fieldListCSV').remove();

  if (!$('#loaderAnalysisCSV')[0])//Só renderiza se já não existir
    $('#analiseCSV').append(`<span id='loaderAnalysisCSV' class='ui-icon ui-icon-loading-status-balls spin loader-analise'></span>`);

  Papa.parse(file, {
    header: true,
    skipEmptyLines: "greedy",
    encoding: $("#inputBD").attr('encoding') === "utf-8" ? "utf-8" : "windows-1252",
    complete: (results) => {
      fillCSVAnalysis(results, file.name);
      $("#loaderAnalysisCSV").remove();
      adjustModalPosition('analiseCSV');
    }
  })
}

const fillCSVAnalysis = (parseData, filename) => {

  CSVFileName = filename;
  CSVData = parseData.data;

  CSVHeaders = Object.keys(CSVData[0]).filter(Boolean);//Rearranjo para remover cabeçalhos vazios

  $('#analiseCSV').append(`<div id='fieldListCSV'></div>`)
  $('#fieldListCSV').append(`<p class="textAnalysis"><span class='ui-icon ui-icon-arrow-r'></span> Arquivo: ${filename}</p>`)
  if (CSVHeaders.length) {
    let lista = `<ul class="textAnalysis">\n`;
    CSVHeaders.forEach((field) => {
      lista += `<li>${field}</li>\n`
    })
    lista += '</ul>';
    $('#fieldListCSV').append(`
    <p class="textAnalysis dFielTitle"><span class='ui-icon ui-icon-arrowreturn-1-s curvedArrow'></span> Quantidade de registros: ${CSVData.length}</p>
    <p class="textAnalysis dFielTitle"><span class='ui-icon ui-icon-arrowreturn-1-s curvedArrow'></span> Cabeçalhos detectados:</p>
    ${lista}`);
    $("#btnConfirmAnalysis").prop('disabled', false).removeClass('ui-button-disabled ui-state-disabled');
  } else {
    $('#fieldListCSV').append(`<small class="noFieldsError">Não foi identificado nenhum cabeçalho no arquivo enviado. Verifique se a planilha não está vazia.</small>`)
  }
}

export const printDataCrossing = () => {
  $('#divTableDataCrossing').remove();
  $('#cruzData .noFieldsError').remove();

  dataCrossing = [];

  const cleanFields = dynamicFields.map((field) => field.replaceAll('#', ''));
  CSVHeaders.forEach((header) => {
    try {
      const matchedDynamicField = cleanFields.find((field) => field === header);
      if (matchedDynamicField)
        dataCrossing.push(header)
    } catch {
      return
    }
  })

  if (!dataCrossing[0]) {
    $('#cruzData').append(`
    <small class="noFieldsError">Não existe correspondência no arquivo CSV informado!</small>
    `)
  } else {

    let tbody = '';
    dataCrossing.forEach((data) => {
      tbody += `
          <tr>
            <td>${data}</td>
            <td id="arrow-data-crossing"><span class='ui-icon ui-icon-arrow-1-e'></span></td>
            <td>##${data}##</td>
          </tr>
          `;
    })

    let selectData = '';
    CSVHeaders.forEach(header => {
      selectData += `<option>${header}</option>`
    })


    $('#cruzData').append(`
      <div id="divTableDataCrossing">
        <table id="tableDataCrossing">
          <thead>
            <th>${CSVFileName}</th>
            <th></th>
            <th>${selectedModel.nome}</th>
          </thead>
          <tbody>
            ${tbody}
          </tbody>
        </table>
    ${getSeiVersion().startsWith("3") ?
        `<hr style="all:revert">
      <div>
        <p>Nome do documento na árvore de processos*</p>
        <select id="nomesDoc">${selectData}</select>
        <small>*Alguns documentos possuem a propriedade <b>Número</b> que quando preenchida exibe o valor na árvore de processos logo após o tipo. Exemplo: Anexo Contrato (Anexo = tipo e Contrato=Número)</small>
        <div class="divInputForceNames">
        <input id="checkForceNames" type="checkbox">
        <label for="checkForceNames">Forçar atribuição de nomes na Árvore (Pode gerar erros 💀)</label>
        </div>
      </div>
      </div>
      `
        : /^4\.1|^5/.test(getSeiVersion()) ?
          `<hr style="all:revert">
      <div>
        <p>Selecione a coluna que contém o valor para o <strong>NOME DO DOCUMENTO</strong> na árvore de processos*</p>
        <select id="nomesDoc">${selectData}</select>
        <small style="font-size:0.7rem">*Somente alguns tipos de documentos suportam</small>
      </div>
      <hr style="all:revert">
      <div>
        <p>Selecione a coluna que contém o valor para <strong>DESCRIÇÃO DO DOCUMENTO</strong></p>
        <select id="descricaoDoc">
        ${selectData}
        <option value="0">Não preencher o campo "Descrição" do documento</option>
        </select>
      </div>
      </div>
      `: ""}`)

  }

  adjustModalPosition('cruzData');
  setTimeout(() => $('#cruzData')[0].scrollTo(0, 0), 300);
}

const adjustModalPosition = label => {
  const modal = $(`div[aria-describedby='${label}']`)[0];
  const modalHeight = modal.offsetHeight;
  const windowHeight = window.innerHeight;
  const newModalTopDistance = (windowHeight - modalHeight) / 2;

  $(modal).css('top', newModalTopDistance);
}

export const getDocsNames = () => {
  docsNames = $('#nomesDoc').val();
}

export const getDescricaoDoc = () => {
  const val = $('#descricaoDoc').val();
  if (val === "0") return;
  descricaoDoc = val
}

export const execute = async () => {

  aborted = false;

  const idIframe = /^4\.1|^5/.test(getSeiVersion()) ? "#ifrConteudoVisualizacao" : "#ifrVisualizacao";

  const urlNewDoc = $(idIframe).contents().find("img[alt='Incluir Documento'").parent().attr('href');


  if (getSeiVersion().startsWith("3")) {

    forceNames = $("#checkForceNames").is(":checked");

    const regex = new RegExp(Object.keys(normalChars).join('|'));
    const hasSpecialChars = CSVData.some(data => data[docsNames].match(regex))
    if (hasSpecialChars) {
      const confirmSpecialChars = confirm(`
Os nomes escolhidos para constar na árvore de processos contém caracteres especiais.

O ideal é que não possuam.Portanto, é possível que ocorram alguns problemas de formatação.

Deseja continuar ?
      `)
      if (!confirmSpecialChars) {
        $('#execucao').dialog('close');
        $("#cruzData").dialog("open");
        flagConfirmSpecialChars = true;
        return;
      }
    }
  }

  for (let i = 0; i < CSVData.length; i++) {

    try {

      const response1 = await clickNewDoc(urlNewDoc);

      const response2 = await selectDocType(response1.urlExpandDocList);

      const response3 = await formNewDoc(response2.urlFormNewDoc, response2.params, CSVData[i],);

      const response4 = await confirmDocData(response3.urlConfirmDocData, response3.params);

      const response5 = await editDocContent(response4.urlEditor, CSVData[i]);

      const response6 = await saveDoc(response5.urlSubmitForm, response5.paramsSaveDoc, response5.isEditorNovo);

      response6.success && $('#progress').html(`<p style="text-align:center">${i + 1}/${CSVData.length}</p>`);

      if (i + 1 === CSVData.length) throw new Error("cancel");

    } catch (e) {
      if (e.message && e.message === "cancel") {
        $('#ifrArvore').contents()[0].location.reload();
        setTimeout(() => {
          $('#cancelExecute').hide();
          $('#progress').html(`<p style="text-align:center">Progresso finalizado!</p>`)
          setTimeout(() => {
            $('#execucao').dialog('close');
            $('#cancelExecute').show();
            $('#progress').html(`<p style="text-align:center">Preparando ambiente</p>`)
          }, 2000);
        }, 500)
      } else {
        flagError = true;
        console.log("Erro 😢 -> ", e);
        $('#execucao').dialog('close');
        $('#modalErro').dialog('open');
      }
      aborted = false;
      break;
    }
  }

}


const clickNewDoc = async (urlNewDoc) => {

  const htmlChooseDocType = await $.get(urlNewDoc);

  const urlExpandDocList = $(htmlChooseDocType).find('#frmDocumentoEscolherTipo').attr('action');

  if (aborted) throw new Error("cancel");
  return {
    urlExpandDocList,
    success: true
  }
}
const selectDocType = async (urlExpandDocList) => {

  const htmlExpandedDocList = await $.ajax({
    method: 'POST',
    url: urlExpandDocList,
    data: { hdnFiltroSerie: 'T' }
  })

  const htmlTypeList = $(htmlExpandedDocList).find('.ancoraOpcao')
  let typeList = []
  let success = false;


  for (let i = 0; i < htmlTypeList.length; i++) {
    typeList.push({
      nome: htmlTypeList[i].textContent,
      url: htmlTypeList[i].getAttribute("href"),
      handlerOnClick: htmlTypeList[i].getAttribute("onclick"),
    })
  }

  if (aborted) throw new Error("cancel");

  let urlFormNewDoc;
  let idSerie = '';

  let params = {};

  if (/^4\.1|^5/.test(getSeiVersion())) {
    urlFormNewDoc = $(htmlExpandedDocList).find('#frmDocumentoEscolherTipo').attr('action');
    success = typeList.some((type) => {
      if (selectedModel.nome.startsWith(type.nome)) {
        const str = type.handlerOnClick
        idSerie = str.substring(str.indexOf("(") + 1, str.indexOf(")"));
        return true;
      }
    })


    $(htmlExpandedDocList).find('input[type="hidden"]').each((i, elem) => {
      params[$(elem).attr('id')] = $(elem).val();
    })

    params.hdnIdSerie = idSerie;

    return {
      urlFormNewDoc,
      success,
      params
    }

  } else {
    success = typeList.some((type) => {
      if (selectedModel.nome.startsWith(type.nome)) {
        urlFormNewDoc = type.url;
        return true;
      }
    })
    return {
      urlFormNewDoc,
      success,
      params
    };
  }

}
const formNewDoc = async (urlFormNewDoc, params0, data) => {

  let htmlFormNewDoc;

  if (/^4\.1|^5/.test(getSeiVersion())) {
    htmlFormNewDoc = await $.ajax({
      method: 'POST',
      url: urlFormNewDoc,
      data: params0
    });
  } else {
    htmlFormNewDoc = await $.get(urlFormNewDoc);
  }

  const form = $(htmlFormNewDoc).find('#frmDocumentoCadastro')
  const urlConfirmDocData = form.attr('action');

  const numeroOpcional = form.find("#lblNumero").attr('class') === 'infraLabelOpcional';

  let params = {};
  form.find("input[type=hidden]").each(function () {
    if ($(this).attr('name') && $(this).attr('id').includes('hdn')) {
      params[$(this).attr('name')] = $(this).val();
    }
  });
  form.find('input[type=text]').each(function () {
    if ($(this).attr('id') && $(this).attr('id').includes('txt')) {
      params[$(this).attr('id')] = $(this).val();
    }
  });
  form.find('select').each(function () {
    if ($(this).attr('id') && $(this).attr('id').includes('sel')) {
      params[$(this).attr('id')] = $(this).val();
    }
  });
  form.find('input[type=radio]').each(function () {
    if ($(this).attr('name') && $(this).attr('name').includes('rdo')) {
      params[$(this).attr('name')] = $(this).val();
    }
  });
  params.rdoNivelAcesso = '0';
  params.hdnFlagDocumentoCadastro = '2';
  params.txaObservacoes = '';

  const regex = new RegExp(Object.keys(normalChars).join('|'), 'g');
  if (descricaoDoc) {
    params.txtDescricao = data[descricaoDoc].replace(regex, (match) => normalChars[match]).substring(0, 50);;
  } else {
    params.txtDescricao = '';
  }
  params.txtProtocoloDocumentoTextoBase = selectedModel.numero;

  if (!numeroOpcional | forceNames) {
    params.txtNumero = data[docsNames].replace(regex, (match) => normalChars[match]).substring(0, 50);
  } else {
    params.txtNumero = '';
  }

  if (aborted) throw new Error("cancel");
  return {
    urlConfirmDocData,
    params,
    success: true
  };
}
const confirmDocData = async (urlConfirmDocData, params) => {

  const htmlDocCreated = await $.ajax({
    method: 'POST',
    url: urlConfirmDocData,
    data: params
  })

  const lines = htmlDocCreated.split('\n');

  let urlEditor = '';
  try {
    if (getSeiVersion().startsWith("3")) {
      urlEditor = lines.filter((line) => line.includes(`if ('controlador.php?acao=editor_montar`))[0].match(/'(.+)'!/)[1];
    }
    else if (getSeiVersion().startsWith("4.0")) {
      urlEditor = lines.filter((line) => line.includes(`infraAbrirJanela('controlador.php?acao=editor_montar`))[0].match(/'(.+?)'/)[0].replaceAll("'", "");;
    }
    else if (/^4\.1|^5/.test(getSeiVersion())) {
      urlEditor = lines.filter((line) => line.includes(`var linkEditarConteudo = 'controlador.php?acao=editor_montar`))[0].match(/'(.+?)'/)[0].replaceAll("'", "");;
    }
    else {

      throw new Error('versão do SEI incompatível');
    }
  } catch (e) {
    console.error(e);
  }


  if (aborted) throw new Error("cancel");

  return {
    urlEditor,
    success: true
  };

}
const editDocContent = async (urlEditor, data) => {

  const regex1 = new RegExp(dataCrossing.map((data) => `##${data}##`).join('|'), 'g');
  const regex2 = new RegExp(Object.keys(specialChars).join('|'), 'g');

  const htmlEditor = await $.get(urlEditor);

  let urlSubmitForm = '';
  let paramsSaveDoc = {};

  // A versão do SEI não distingue os editores: uma mesma 5.0.4 pode servir o
  // editor clássico (form #frmEditor) ou o editor novo, que injeta o objeto
  // window.INFRA_EDITOR_CONFIG. Detectamos pelo conteúdo do HTML, não pela versão.
  const termoInicial = 'window.INFRA_EDITOR_CONFIG = ';
  const isEditorNovo = htmlEditor.includes(termoInicial);

  if (!isEditorNovo) {

    // Envolve o HTML num container para que #frmEditor, textareas e inputs
    // sejam sempre descendentes. Ao passar um documento completo para $(),
    // o jQuery achata os nós: dependendo do markup, #frmEditor pode virar nó
    // de topo (não encontrado por .find()) em vez de descendente.
    const $editor = $('<div>').append($.parseHTML(htmlEditor));

    urlSubmitForm = $editor.find('#frmEditor').attr('action');

    const textAreas = $editor.find('div#divEditores textarea');

    const textAreasReplaced = textAreas.map((_, el) =>
      $(el).text().replace(regex1, (match) =>
        data[match.substring(2, match.length - 2)].replace(regex2, (match) => specialChars[match])
      )
    )

    textAreasReplaced.each((i, textArea) => {
      paramsSaveDoc[$(textAreas).eq(i).attr('name')] = textArea;
    });

    $editor.find('input[type=hidden').each((_, input) => {
      if (!$(input).attr('name').toLowerCase().includes('unidade'))
        paramsSaveDoc[$(input).attr('name')] = $(input).val().replace(regex2, (match) => specialChars[match]);
    })

  } else {//editor novo (INFRA_EDITOR_CONFIG)

    const startIndex = htmlEditor.indexOf(termoInicial) + termoInicial.length;
    const endIndex = htmlEditor.indexOf(';</script>', startIndex);
    const jsonString = htmlEditor.substring(startIndex, endIndex);

    const editorConfig = JSON.parse(jsonString);

    const initialData = editorConfig.initialData;

    urlSubmitForm = editorConfig.sei.urlSalvar;

    let secoesConteudo = [];
    Object.keys(initialData).forEach((key) => secoesConteudo.push({
      "nome": key,
      "html": initialData[key].replace(regex1, (match) => data[match.substring(2, match.length - 2)].replace(regex2, (match) => specialChars[match]))
    }))

    const payload = {
      "secoesConteudo": secoesConteudo,
      "ignorarNovaVersao": "S",
      "versao": 2,
      "comentarios": {
        "itens": [],
        "hashPosicoes": null
      },
    }

    paramsSaveDoc = JSON.stringify(payload);
  }

  if (aborted) throw new Error("cancel");
  return {
    urlSubmitForm,
    paramsSaveDoc,
    isEditorNovo,
    success: true
  }

}
const saveDoc = async (urlSubmitForm, paramsSaveDoc, isEditorNovo) => {

  
  const options = {
    method: 'POST',
    url: urlSubmitForm,
    data: paramsSaveDoc,
  };

  if (isEditorNovo) {
    options.dataType = "json";
    options.contentType = "application/json; charset=utf-8";
  }

  const responseSave = await $.ajax(options);

  if (aborted) throw new Error("cancel");


  if (isEditorNovo) {
    return { success: true }
  } else if (responseSave.startsWith("OK")) {
    return { success: true }
  }
  else {
    //return { success: true }
    throw new Error('Erro');
  }

}

export const abortAjax = () => {
  if (!flagError && !flagConfirmSpecialChars) {
    aborted = true;
    $('#cancelExecute').hide();
    $('#progress').html(`<p style="text-align:center">Cancelando progresso</p>`)
  } else {
    flagError = false;
    flagConfirmSpecialChars = false;
    aborted = false;
  }
}

