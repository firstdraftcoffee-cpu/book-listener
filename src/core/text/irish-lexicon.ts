// Built-in pronunciations for Irish names, places and words that general-purpose English
// text-to-speech commonly gets wrong. IPA is written in the symbol set the Kokoro voices understand.
//
// IMPORTANT: these were written from published pronunciation guides and have NOT been checked by an
// Irish speaker listening to the output. Treat them as a starting point: anything that sounds wrong
// can be overridden per book in Settings > Pronunciation, and user rules always win over this list.
//
// Format: [written form, IPA]. Diacritics are optional when matching ("Siobhan" matches "Siobhán").

export const IRISH_LEXICON: Array<[string, string]> = [
  // --- First names ---
  ['Siobhán', 'ʃɪvˈɔːn'], ['Sinéad', 'ʃɪnˈeɪd'], ['Aoife', 'ˈiːfə'], ['Niamh', 'nˈiːv'], ['Saoirse', 'sˈɜːɹʃə'],
  ['Oisín', 'əʃˈiːn'], ['Caoimhe', 'kˈiːvə'], ['Tadhg', 'tˈaɪɡ'], ['Ciarán', 'kˈɪəɹɑːn'], ['Cian', 'kˈiːən'],
  ['Rían', 'ɹˈiːən'], ['Róisín', 'ɹoʊʃˈiːn'], ['Gráinne', 'ɡɹˈɔːnjə'], ['Fionn', 'fˈɪn'], ['Fionnuala', 'fɪnˈuːlə'],
  ['Fionnán', 'fˈɪnɑːn'], ['Eoin', 'ˈoʊɪn'], ['Eoghan', 'ˈoʊən'], ['Séamus', 'ʃˈeɪməs'], ['Seamus', 'ʃˈeɪməs'], ['Seán', 'ʃˈɔːn'],
  ['Pádraig', 'pˈɔːdɹɪɡ'], ['Pádraic', 'pˈɔːdɹɪk'], ['Dónal', 'dˈoʊnəl'], ['Domhnall', 'dˈoʊnəl'], ['Donncha', 'dˈʌnəkə'],
  ['Diarmuid', 'dˈɪəɹmɪd'], ['Cormac', 'kˈɔːɹmək'], ['Colm', 'kˈɒləm'], ['Conchúr', 'kˈɒnəɹ'], ['Cathal', 'kˈæhəl'],
  ['Ruairí', 'ɹˈʊəɹiː'], ['Ruaidhrí', 'ɹˈʊəɹiː'], ['Mairéad', 'məɹˈeɪd'], ['Méabh', 'mˈeɪv'], ['Úna', 'ˈuːnə'], ['Eithne', 'ˈɛnjə'],
  ['Clodagh', 'klˈoʊdə'], ['Orla', 'ˈɔːɹlə'], ['Orlaith', 'ˈɔːɹlə'], ['Sorcha', 'sˈɔːɹəkə'], ['Dearbhla', 'dˈɜːɹvlə'], ['Oonagh', 'ˈuːnə'],
  ['Declan', 'dˈɛklən'], ['Cillian', 'kˈɪliən'], ['Éamon', 'ˈeɪmən'], ['Eamon', 'ˈeɪmən'], ['Eamonn', 'ˈeɪmən'], ['Aisling', 'ˈæʃlɪŋ'],
  ['Eimear', 'ˈiːməɹ'], ['Ailbhe', 'ˈælvə'], ['Caitríona', 'kətɹˈiːnə'], ['Gearóid', 'ɡˈæɹoʊd'], ['Lorcan', 'lˈɔːɹkən'],
  ['Odhrán', 'ˈoʊɹɑːn'], ['Rónán', 'ɹˈoʊnɑːn'], ['Mícheál', 'mˈiːhɔːl'], ['Aodhán', 'ˈeɪdɑːn'], ['Aodh', 'ˈeɪ'],
  ['Tiarnán', 'tʃˈɪɹnɑːn'], ['Labhrás', 'lˈaʊɹəs'], ['Muireann', 'mˈɪɹən'], ['Nuala', 'nˈuːlə'], ['Sadhbh', 'sˈaɪv'],
  ['Cúchulainn', 'kuːkˈʌlɪn'], ['Cú Chulainn', 'kuːkˈʌlɪn'], ['Brigid', 'bɹˈɪdʒɪd'], ['Bríd', 'bɹˈiːd'], ['Fergal', 'fˈɜːɡəl'],
  ['Lochlann', 'lˈɒklən'], ['Ultan', 'ˈʌltən'], ['Tiernan', 'tˈɪəɹnən'], ['Dymphna', 'dˈɪmfnə'],

  // --- Places ---
  ['Dún Laoghaire', 'dˌʌn lˈɪəɹi'], ['Dun Laoghaire', 'dˌʌn lˈɪəɹi'], ['Laois', 'lˈiːʃ'], ['Portlaoise', 'pɔːɹtlˈiːʃ'], ['Cobh', 'kˈoʊv'],
  ['Youghal', 'jˈɔːl'], ['Leixlip', 'lˈɛksˌlɪp'], ['Athlone', 'æθlˈoʊn'], ['Dalkey', 'dˈɔːki'], ['Howth', 'hˈoʊθ'],
  ['Kinsale', 'kɪnsˈeɪl'], ['Drogheda', 'dɹˈɒhədə'], ['Glendalough', 'ɡlˌɛndəlˈɒk'], ['Clonmel', 'klɒnmˈɛl'],
  ['Clonakilty', 'klˌɒnəkˈɪlti'], ['Dungarvan', 'dʌŋɡˈɑːɹvən'], ['Ranelagh', 'ɹˈænələ'], ['Rathmines', 'ɹɑːθmˈaɪnz'],
  ['Phibsborough', 'fˈɪbzbɹə'], ['Fumbally', 'fˈʌmbəli'], ['Liffey', 'lˈɪfi'], ['Tallaght', 'tˈælət'], ['Ennistymon', 'ˌɛnɪstˈaɪmən'],
  ['Skellig', 'skˈɛlɪɡ'], ['Skelligs', 'skˈɛlɪɡz'], ['Skellig Michael', 'skˈɛlɪɡ mˈaɪkəl'], ['Dingle', 'dˈɪŋɡəl'], ['Slaney', 'slˈeɪni'],
  ['Inishmore', 'ˌɪnɪʃmˈɔːɹ'], ['Inis Mór', 'ˌɪnɪʃ mˈɔːɹ'], ['Connemara', 'kˌɒnɪmˈɑːɹə'], ['Donegal', 'dˈɒnɪɡɔːl'], ['Tipperary', 'tˌɪpəɹˈɛəɹi'],
  ['Kilkenny', 'kɪlkˈɛni'], ['Monaghan', 'mˈɒnəhən'], ['Roscommon', 'ɹɒskˈɒmən'], ['Mullingar', 'mˌʌlɪŋɡˈɑːɹ'], ['Carrickmacross', 'kˌæɹɪkməkɹˈɒs'],
  ['Newgrange', 'njuːɡɹˈeɪndʒ'], ['Tara', 'tˈɑːɹə'], ['Ballsbridge', 'bˈɔːlzbɹɪdʒ'], ['Donnybrook', 'dˈɒnibɹʊk'], ['Sandymount', 'sˈændimaʊnt'],
  ['Ringsend', 'ɹˈɪŋzɛnd'], ['Grafton', 'ɡɹˈɑːftən'], ['Temple Bar', 'tˈɛmpəl bˈɑːɹ'], ['Malahide', 'mˈæləhaɪd'], ['Swords', 'sˈɔːɹdz'],
  ['Killarney', 'kɪlˈɑːɹni'], ['Galway', 'ɡˈɔːlweɪ'], ['Ballina', 'bˌælɪnˈɑː'], ['Lisdoonvarna', 'lˌɪsduːnvˈɑːɹnə'], ['Doolin', 'dˈuːlɪn'],
  ['Éire', 'ˈɛɹə'], ['Eire', 'ˈɛɹə'], ['Ulster', 'ˈʌlstəɹ'], ['Leinster', 'lˈɛnstəɹ'], ['Munster', 'mˈʌnstəɹ'], ['Connacht', 'kˈɒnɔːt'],

  // --- Institutions, words and terms ---
  ['Dáil', 'dˈɔɪl'], ['Seanad', 'ʃˈænəd'], ['Taoiseach', 'tˈiːʃək'], ['Tánaiste', 'tˈɔːnəʃtə'], ['Gardaí', 'ɡɑːɹdˈiː'], ['Garda', 'ɡˈɑːɹdə'],
  ['Fianna Fáil', 'fˌiːənə fˈɔɪl'], ['Fine Gael', 'fˌɪnə ɡˈeɪl'], ['Sinn Féin', 'ʃˌɪn fˈeɪn'], ['Oireachtas', 'ˈɛɹəktəs'], ['Gaeltacht', 'ɡˈeɪltəkt'],
  ['Gaelic', 'ɡˈeɪlɪk'], ['Gaeilge', 'ɡˈeɪlɡə'], ['Céilí', 'kˈeɪli'], ['Ceilidh', 'kˈeɪli'], ['Craic', 'kɹˈæk'], ['Sláinte', 'slˈɑːntʃə'],
  ['Bodhrán', 'bˈɔːɹɑːn'], ['Uilleann', 'ˈɪlɪn'], ['Poitín', 'pɒtʃˈiːn'], ['Samhain', 'sˈaʊɪn'], ['Lughnasa', 'lˈuːnəsə'], ['Imbolc', 'ˈɪmbəlɡ'],
  ['Bealtaine', 'bjˈɑːltənə'], ['Tír na nÓg', 'tˌɪɹ nə nˈoʊɡ'], ['Brian Boru', 'bɹˌaɪən bəɹˈuː'], ['de Valera', 'dɛ vəlˈɛɹə'], ['Leopardstown', 'lˈɛpəɹdztaʊn'],
  ['Béal Feirste', 'bˌeɪl fˈɛɹʃtə'], ['Teach', 'tʃˈæk'], ['Ógra', 'ˈoʊɡɹə'], ['Cumann', 'kˈʌmən'], ['Ard Fheis', 'ˌɑːɹd ˈɛʃ'], ['Mná', 'mnˈɔː'],
  ['Feis', 'fˈɛʃ'], ['Brehon', 'bɹˈiːhən'], ['Féile', 'fˈeɪlə'], ['Bean', 'bˈæn'],
];

/** strip diacritics and lowercase: "Siobhán" -> "siobhan" */
export function foldKey(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
