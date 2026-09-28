"use strict";

function countLiteral(text, token) {
  let count = 0;
  let offset = 0;
  while ((offset = text.indexOf(token, offset)) !== -1) {
    count += 1;
    offset += token.length;
  }
  return count;
}

cindy.onHostMessage(async function (msg) {
  if (msg.type !== "tool-call") return;
  if (msg.tool !== "check_protected_tokens") {
    await cindy.send({type:"tool-result",callId:msg.callId,ok:false,errorCode:"UNSUPPORTED_TOOL",message:"请使用清单中声明的 check_protected_tokens 工具。"});
    return;
  }
  const args = msg.args || {};
  if (typeof args.source !== "string" || typeof args.translation !== "string" ||
      args.source.length > 100000 || args.translation.length > 100000 ||
      !Array.isArray(args.tokens) || args.tokens.length < 1 || args.tokens.length > 64 ||
      args.tokens.some(token => typeof token !== "string" || token.length < 1 || token.length > 512) ||
      new Set(args.tokens).size !== args.tokens.length) {
    await cindy.send({type:"tool-result",callId:msg.callId,ok:false,errorCode:"INVALID_INPUT",message:"请提供不超过 100000 字符的原文和润色文本，以及 1 至 64 个不重复的非空保护片段，每个最多 512 字符。"});
    return;
  }
  const checks = args.tokens.map(token => {
    const sourceCount = countLiteral(args.source, token);
    const translationCount = countLiteral(args.translation, token);
    const status = sourceCount === 0 ? "not_in_source" :
      translationCount < sourceCount ? "missing" :
      translationCount > sourceCount ? "extra" : "same_count";
    return {token, sourceCount, translationCount, status};
  });
  await cindy.send({type:"tool-result",callId:msg.callId,ok:true,result:{
    checks,
    issues:checks.filter(item => item.status !== "same_count"),
    scope:"仅比较指定片段的逐字出现次数；未检查语义、模板语法、标签嵌套、顺序或未指定片段。"
  }});
});
