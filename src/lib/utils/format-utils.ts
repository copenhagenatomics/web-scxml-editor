export function formatXML(xml: string): string {
  const PADDING = '  ';
  const reg = /(>)(<)(\/*)/g;
  const formatted = xml.replace(reg, '$1\r\n$2$3');
  
  let pad = 0;
  return formatted.split('\r\n').map((node) => {
    let indent = 0;
    if (node.match(/.+<\/\w[^>]*>$/)) {
      indent = 0;
    } else if (node.match(/^<\/\w/) && pad > 0) {
      pad -= 1;
    } else if (node.match(/^<\w[^>]*[^\/]>.*$/)) {
      indent = 1;
    } else {
      indent = 0;
    }
    
    const padding = PADDING.repeat(pad);
    pad += indent;
    
    return padding + node;
  }).join('\r\n');
}

export function minifyXML(xml: string): string {
  return xml
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();
}

export function escapeXML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function unescapeXML(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}