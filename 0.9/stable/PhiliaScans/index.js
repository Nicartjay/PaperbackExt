var source=(function(e){Object.defineProperty(e,Symbol.toStringTag,{value:`Module`});function t(e){"@babel/helpers - typeof";return t=typeof Symbol==`function`&&typeof Symbol.iterator==`symbol`?function(e){return typeof e}:function(e){return e&&typeof Symbol==`function`&&e.constructor===Symbol&&e!==Symbol.prototype?`symbol`:typeof e},t(e)}function n(e,n){if(t(e)!=`object`||!e)return e;var r=e[Symbol.toPrimitive];if(r!==void 0){var i=r.call(e,n||`default`);if(t(i)!=`object`)return i;throw TypeError(`@@toPrimitive must return a primitive value.`)}return(n===`string`?String:Number)(e)}function r(e){var r=n(e,`string`);return t(r)==`symbol`?r:r+``}function i(e,t,n){return(t=r(t))in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}var a=class{constructor(e){i(this,`id`,void 0),this.id=e}registerInterceptor(){Application.registerInterceptor(this.id,Application.Selector(this,`interceptRequest`),Application.Selector(this,`interceptResponse`))}unregisterInterceptor(){Application.unregisterInterceptor(this.id)}};let o={},s={},c=async e=>{if(o[e]){await o[e],await c(e);return}o[e]=new Promise(t=>s[e]=()=>{delete o[e],t()})},l=e=>{s[e]&&s[e]()};var u=class extends a{constructor(e,t){super(e),i(this,`options`,void 0),i(this,`promise`,void 0),i(this,`currentRequestsMade`,0),i(this,`lastReset`,Date.now()),i(this,`imageRegex`,new RegExp(/\.(avif|gif|jpeg|jpg|jxl|png|webp)(\?|$)/i)),this.options=t}async interceptRequest(e){return this.options.ignoreImages&&this.imageRegex.test(e.url)?e:(await c(this.id),await this.incrementRequestCount(),l(this.id),e)}async interceptResponse(e,t,n){return n}async incrementRequestCount(){if(await this.promise,(Date.now()-this.lastReset)/1e3>this.options.bufferInterval&&(this.currentRequestsMade=0,this.lastReset=Date.now()),this.currentRequestsMade+=1,this.currentRequestsMade>=this.options.numberOfRequests){let e=(Date.now()-this.lastReset)/1e3;if(e<=this.options.bufferInterval){let t=this.options.bufferInterval-e;console.log(`[BasicRateLimiter] rate limit hit, sleeping for ${t}`),this.promise=Application.sleep(t)}}}},d=class extends Error{constructor(e,t=`Cloudflare bypass is required`){super(t),i(this,`resolutionRequest`,void 0),i(this,`type`,`cloudflareError`),this.resolutionRequest=e}};function f(e){let t={},n=e.match(/^(?:([a-zA-Z][a-zA-Z\d+\-.]*):)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/);if(!n)throw Error(`Invalid URL string provided.`);if(n[1]!==void 0&&n[1]!==``&&(t.protocol=n[1]),n[2]!==void 0&&n[2]!==``){let e=n[2],r=``,i=``,a=e.indexOf(`@`);if(a!==-1){if(r=e.substring(0,a),i=e.substring(a+1),r!==``){let e=r.indexOf(`:`);e===-1?(t.username=r,t.password=``):(t.username=r.substring(0,e),t.password=r.substring(e+1))}}else i=e;if(i!==``)if(i.startsWith(`[`)){let e=i.indexOf(`]`);if(e===-1)throw Error(`Invalid IPv6 address in URL update.`);t.hostname=i.substring(0,e+1);let n=i.substring(e+1);n.startsWith(`:`)&&(t.port=n.substring(1))}else{let e=i.lastIndexOf(`:`);e!==-1&&i.indexOf(`:`)===e?(t.hostname=i.substring(0,e),t.port=i.substring(e+1)):(t.hostname=i,t.port=``)}}if(n[3]!==void 0&&n[3]!==``&&(t.path=n[3].startsWith(`/`)?n[3]:`/${n[3]}`),n[4]!==void 0){let e={},r=n[4].split(`&`);for(let t of r){if(!t)continue;let[n,r=``]=t.split(`=`);if(n===void 0)continue;let i=decodeURIComponent(n),a=decodeURIComponent(r);if(i in e){let t=e[i];Array.isArray(t)?t.push(a):e[i]=[t,a]}else e[i]=a}t.queryItems=e}return n[5]!==void 0&&(t.fragment=n[5]),t}var p=class{constructor(e){i(this,`protocol`,void 0),i(this,`hostname`,void 0),i(this,`path`,void 0),i(this,`username`,void 0),i(this,`password`,void 0),i(this,`port`,void 0),i(this,`queryItems`,void 0),i(this,`fragment`,void 0);let t=f(e);if(!t.hostname||!t.protocol)throw Error(`URL Hostname and Protocol are required`);this.hostname=t.hostname,this.protocol=t.protocol,this.path=t.path??``,this.username=t.username,this.password=t.password,this.port=t.port,this.queryItems=t.queryItems,this.fragment=t.fragment}toString(){let e=`${this.protocol}://`;if(this.username!==void 0&&this.username!==``&&(e+=this.username,this.password!==void 0&&this.password!==``&&(e+=`:${this.password}`),e+=`@`),e+=this.hostname,this.port!==void 0&&this.port!==``&&(e+=`:${this.port}`),this.path!==``&&(e+=this.path.startsWith(`/`)?this.path:`/${this.path}`),this.queryItems!==void 0){let t=Object.keys(this.queryItems),n=[];if(t.length>0)for(let e of t){let t=this.queryItems[e];if(Array.isArray(t))for(let r of t)n.push(`${encodeURIComponent(e)}=${encodeURIComponent(r)}`);else t!==void 0&&n.push(`${encodeURIComponent(e)}=${encodeURIComponent(t)}`)}e+=`?${n.join(`&`)}`}return this.fragment!==void 0&&(e+=`#${this.fragment}`),e}setProtocol(e){if(e===``)throw Error(`Protocol is required`);return this.protocol=e,this}setUsername(e){return e===``?this.username=void 0:this.username=e,this}setPassword(e){return e===``?this.password=void 0:this.password=e,this}setHostname(e){if(e===``)throw Error(`Hostname is required`);return this.hostname=e,this}setPort(e){return e===``?this.port=void 0:this.port=e,this}setPath(e){return this.path=e.startsWith(`/`)?e:`/${e}`,this}addPathComponent(e){return this.path=(this.path??``)+(e.startsWith(`/`)?e:`/${e}`),this}setQueryItems(e){return this.queryItems=e,this}setQueryItem(e,t){return this.queryItems===void 0&&(this.queryItems={}),this.queryItems[e]=t,this}removeQueryItem(e){return delete this.queryItems?.[e],this}setFragment(e){return this.fragment=e,this}update(e){let t;return t=typeof e==`string`?f(e):e,t.protocol!==void 0&&this.setProtocol(t.protocol),t.username!==void 0&&this.setUsername(t.username),t.password!==void 0&&this.setPassword(t.password),t.hostname!==void 0&&this.setHostname(t.hostname),t.port!==void 0&&this.setPort(t.port),t.path!==void 0&&this.setPath(t.path),t.queryItems!==void 0&&this.setQueryItems(t.queryItems),t.fragment!==void 0&&this.setFragment(t.fragment),this}};let m=`cookie_store_cookies`;var h=class extends a{get cookies(){return Object.freeze(Object.values(this._cookies))}set cookies(e){let t={};for(let n of e)this.isCookieExpired(n)||(t[this.cookieIdentifier(n)]=n);this._cookies=t,this.saveCookiesToStorage()}constructor(e){super(`cookie_store`),i(this,`options`,void 0),i(this,`_cookies`,{}),this.options=e,this.loadCookiesFromStorage()}async interceptRequest(e){return e.cookies={...e.cookies??{},...this.cookiesForUrl(e.url).reduce((e,t)=>(e[t.name]=t.value,e),{})},e}async interceptResponse(e,t,n){let r=this._cookies;for(let e of t.cookies){let t=this.cookieIdentifier(e);if(this.isCookieExpired(e)){delete r[t];continue}r[t]=e}return this._cookies=r,this.saveCookiesToStorage(),n}setCookie(e){this.isCookieExpired(e)||(this._cookies[this.cookieIdentifier(e)]=e,this.saveCookiesToStorage())}deleteCookie(e){delete this._cookies[this.cookieIdentifier(e)]}cookiesForUrl(e){let t=new p(e),n=t.hostname;if(!n)return[];let r={},i=t.path.startsWith(`/`)?t.path:`/${t.path}`,a=n.split(`.`),o=i.split(`/`);o.shift();let s=this.cookies;for(let e of s){if(this.isCookieExpired(e)){delete this._cookies[this.cookieIdentifier(e)];continue}let t=this.cookieSanitizedDomain(e).split(`.`);if(a.length<t.length||t.length==0)continue;let n=!0;for(let e=0;e<t.length;e++){let r=t.length-1-e,i=a.length-1-e;if(t[r]!=a[i]){n=!1;break}}if(!n)continue;let s=this.cookieSanitizedPath(e),c=s.split(`/`);c.shift();let l=0;if(i===s)l=2**53-1;else if(c.length===0||s===`/`)l=1;else if(i.startsWith(s)&&o.length>=c.length)for(let e=0;e<c.length&&c[e]===o[e];e++)l+=1;l<=0||(r[e.name]?.pathMatches??0)<l&&(r[e.name]={cookie:e,pathMatches:l})}return Object.values(r).map(e=>e.cookie)}cookieIdentifier(e){return`${e.name}-${this.cookieSanitizedDomain(e)}-${this.cookieSanitizedPath(e)}`}cookieSanitizedPath(e){return e.path?.startsWith(`/`)?e.path:`/`+(e.path??``)}cookieSanitizedDomain(e){return e.domain.replace(/^(www)?\.?/gi,``).toLowerCase()}isCookieExpired(e){return!!(e.expires&&e.expires.getTime()<=Date.now())}loadCookiesFromStorage(){if(this.options.storage==`memory`)return;let e=Application.getState(m);if(!e){this._cookies={};return}let t={};for(let n of e)!n.expires||this.isCookieExpired(n)||(t[this.cookieIdentifier(n)]=n);this._cookies=t}saveCookiesToStorage(){this.options.storage!=`memory`&&Application.setState(this.cookies.filter(e=>e.expires),m)}},g;(function(e){e[e.NONE=0]=`NONE`,e[e.MANGA_CHAPTERS=1]=`MANGA_CHAPTERS`,e[e.CHAPTER_PROVIDING=1]=`CHAPTER_PROVIDING`,e[e.MANGA_PROGRESS=2]=`MANGA_PROGRESS`,e[e.MANGA_PROGRESS_PROVIDING=2]=`MANGA_PROGRESS_PROVIDING`,e[e.PROGRESS_PROVIDING=2]=`PROGRESS_PROVIDING`,e[e.DISCOVER_SECIONS=4]=`DISCOVER_SECIONS`,e[e.DISCOVER_SECIONS_PROVIDING=4]=`DISCOVER_SECIONS_PROVIDING`,e[e.DISCOVER_SECTION_PROVIDING=4]=`DISCOVER_SECTION_PROVIDING`,e[e.COLLECTION_MANAGEMENT=8]=`COLLECTION_MANAGEMENT`,e[e.MANAGED_COLLECTION_PROVIDING=8]=`MANAGED_COLLECTION_PROVIDING`,e[e.CLOUDFLARE_BYPASS_REQUIRED=16]=`CLOUDFLARE_BYPASS_REQUIRED`,e[e.CLOUDFLARE_BYPASS_PROVIDING=16]=`CLOUDFLARE_BYPASS_PROVIDING`,e[e.SETTINGS_UI=32]=`SETTINGS_UI`,e[e.SETTINGS_FORM_PROVIDING=32]=`SETTINGS_FORM_PROVIDING`,e[e.MANGA_SEARCH=64]=`MANGA_SEARCH`,e[e.SEARCH_RESULTS_PROVIDING=64]=`SEARCH_RESULTS_PROVIDING`,e[e.SEARCH_RESULT_PROVIDING=64]=`SEARCH_RESULT_PROVIDING`})(g||(g={}));var _;(function(e){e.EVERYONE=`SAFE`,e.MATURE=`MATURE`,e.ADULT=`ADULT`})(_||(_={}));var v;(function(e){e[e.featured=0]=`featured`,e[e.simpleCarousel=1]=`simpleCarousel`,e[e.prominentCarousel=2]=`prominentCarousel`,e[e.chapterUpdates=3]=`chapterUpdates`,e[e.genres=4]=`genres`})(v||(v={})),Object.freeze({items:[],metadata:void 0});let y=`https://philiascans.org`,b=`${y}/api`,x=/.*_s\.[^.]+$/,S=[[`Action`,`action`],[`Adventure`,`adventure`],[`Comedy`,`comedy`],[`Drama`,`drama`],[`Ecchi`,`ecchi`],[`Fantasy`,`fantasy`],[`Gourmet`,`gourmet`],[`Harem`,`harem`],[`Historical`,`historical`],[`Isekai`,`isekai`],[`Josei`,`josei`],[`Magic`,`magic`],[`Martial Arts`,`martial-arts`],[`Monsters`,`monsters`],[`Music`,`music`],[`Mystery`,`mystery`],[`Psychological`,`psychological`],[`Regression`,`regression`],[`Romance`,`romance`],[`School Life`,`school-life`],[`Sci-Fi`,`sci-fi`],[`Seinen`,`seinen`],[`Shoujo`,`shoujo`],[`Shounen`,`shounen`],[`Slice of Life`,`slice-of-life`],[`Supernatural`,`supernatural`],[`Survival`,`survival`],[`Tragedy`,`tragedy`],[`Villainess`,`villainess`],[`War`,`war`]];var C=class extends a{async interceptRequest(e){return e.headers={...e.headers,referer:`${y}/`,origin:y,"user-agent":await Application.getDefaultUserAgent(),accept:`text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8`,"accept-language":`en-US,en;q=0.5`},e}async interceptResponse(e,t,n){if(t.headers?.[`cf-mitigated`]===`challenge`)throw new d({url:e.url,method:e.method??`GET`,headers:{"user-agent":await Application.getDefaultUserAgent()}});let r=e.url.indexOf(`#`);if(r<0)return n;let i=e.url.slice(r+1);if(!i)return n;let a=O(e.url.slice(0,r));if(!x.test(a))return n;try{return await T(i,n)}catch{return n}}},w=class{constructor(){i(this,`requestManager`,new C(`main`)),i(this,`cookieStorageInterceptor`,new h({storage:`stateManager`})),i(this,`globalRateLimiter`,new u(`rateLimiter`,{numberOfRequests:2,bufferInterval:1,ignoreImages:!0}))}async initialise(){this.requestManager.registerInterceptor(),this.cookieStorageInterceptor.registerInterceptor(),this.globalRateLimiter.registerInterceptor()}async getDiscoverSections(){return[{id:`popular`,title:`Trending`,type:v.featured},{id:`latest`,title:`Latest Updates`,type:v.simpleCarousel},{id:`genres`,title:`Genres`,type:v.genres}]}async getDiscoverSectionItems(e,t){if(e.id===`genres`)return{items:S.map(([e,t])=>({type:`genresCarouselItem`,name:e,searchQuery:{title:``,metadata:{genre:t}},metadata:void 0})),metadata:void 0};let n=t?.page??1,r=[`page=${n}`,`perPage=20`];e.id===`popular`&&r.push(`orderby=trending`),r.push(`order=desc`);let i=`${b}/manga?${r.join(`&`)}`,a=await this.fetchJson({url:i,method:`GET`}),o=[],s=new Set;for(let t of a.items??[]){let n=this.itemToResult(t);n&&(s.has(n.mangaId)||(s.add(n.mangaId),o.push({type:e.id===`popular`?`featuredCarouselItem`:`simpleCarouselItem`,mangaId:n.mangaId,imageUrl:n.imageUrl,title:n.title,metadata:void 0})))}return{items:o,metadata:this.hasNextPage(a)?{page:n+1}:void 0}}async getSearchResults(e,t){let n=t?.page??1,r=(e.title||``).trim(),i=e.metadata,a=[`page=${n}`,`perPage=20`];r&&a.push(`q=${encodeURIComponent(r)}`),i?.genre&&a.push(`genres=${encodeURIComponent(i.genre)}`),a.push(`order=desc`);let o=`${b}/manga?${a.join(`&`)}`,s=await this.fetchJson({url:o,method:`GET`}),c=[];for(let e of s.items??[]){let t=this.itemToResult(e);t&&c.push({mangaId:t.mangaId,imageUrl:t.imageUrl,title:t.title,subtitle:void 0,metadata:void 0})}return{items:c,metadata:this.hasNextPage(s)?{page:n+1}:void 0}}itemToResult(e){let t=(e.slug||``).trim();if(!t)return;let n=(e.title||t).trim();return{mangaId:this.toSafeId(t),imageUrl:this.absoluteUrl(e.coverImageUrl||``),title:n}}async getMangaDetails(e){let t=this.safeDecode(e),n=`${b}/manga/${t}`,r=await this.fetchJson({url:n,method:`GET`}),i=(r.title||t).trim(),a=(r.alternativeTitles??[]).filter(e=>!!e&&e.trim().length>0),o=(r.synopsis||``).trim();a.length>0&&(o+=`

Alternative Titles:
`+a.map(e=>`- ${e}`).join(`
`));let s=(r.authors??[]).map(e=>e.name||``).filter(e=>e.length>0).join(`, `),c=(r.artists??[]).map(e=>e.name||``).filter(e=>e.length>0).join(`, `),l=(r.genres??[]).map(e=>e.name||``).filter(e=>e.length>0),u=[];return l.length>0&&u.push({id:`genres`,title:`Genres`,tags:l.map(e=>({id:e.toLowerCase().replace(/\s+/g,`-`),title:e}))}),{mangaId:e,mangaInfo:{primaryTitle:i,secondaryTitles:a,thumbnailUrl:this.absoluteUrl(r.coverImageUrl||``),author:s||void 0,artist:c||void 0,synopsis:o,contentRating:_.EVERYONE,status:this.parseStatus(r.status||``),tagGroups:u,shareUrl:this.mangaUrl(e)}}}async getChapters(e){let t=this.safeDecode(e.mangaId),n=`${b}/manga/${t}/chapters`,r=await this.fetchJson({url:n,method:`GET`}),i=[],a=new Set;for(let n of r.items??[]){let r=(n.slug||``).trim();if(!r)continue;let o=this.toSafeId(`${t}/${r}`);if(a.has(o))continue;a.add(o);let s=(n.number||``).trim(),c=n.purchased===!1&&(n.coinPrice??0)!==0?`🔒 `:``,l=(n.title||``).trim(),u=l&&l!==`null`&&l!==s?l:``,d=c+(u?`Chapter ${s} - ${u}`:`Chapter ${s}`);i.push({chapterId:o,sourceManga:e,title:d,volume:0,chapNum:this.parseChapterNumber(s),publishDate:this.parseDate(n.publishedAt),langCode:`🇬🇧`})}return i}async getChapterDetails(e){let t=this.safeDecode(e.chapterId).replace(/^\/+/,``).split(`/`),n=`${b}/manga/${t[0]??``}/chapters/${t[t.length-1]??``}`,r=await this.fetchJson({url:n,method:`GET`});if(r.hasAccess===!1)throw Error(`Log in via WebView and purchase this chapter to read it.`);let i=[...r.chapter?.pages??[]].sort((e,t)=>(e.position??0)-(t.position??0)),a=r.chapter?.id,o=r.chapter?.scrambled?`1`:`0`,s=``,c=0,l=null,u=null;if(a!=null)try{let e=await this.fetchAccessToken(),t={accept:`application/json`,"accept-language":`de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7,ja;q=0.6`,"sec-fetch-mode":`cors`,"x-requested-with":`XMLHttpRequest`};e&&(t[`x-reader-access-token`]=e);let n=await this.fetchJson({url:`${b}/chapters/${a}/page-keys`,method:`GET`,headers:t});if(s=(n.chapterKeyB64||``).trim(),c=n.gridSize??0,n.sessionDefault===!0){let e=await this.fetchJson({url:`${b}/chapters/${a}/open`,method:`POST`,headers:t});l=e.payloadA??null;let n=e.sessionId??``;if(n)try{u=(await this.fetchJson({url:`${b}/chapters/${a}/get-drm?session=${encodeURIComponent(n)}`,method:`GET`,headers:t})).payloadB??null}catch{u=null}}}catch{}let d=[];return i.forEach((e,t)=>{let n=(e.url||``).trim();if(!n)return;let r=(e.mime||`image/jpeg`).trim(),i=this.absoluteUrl(n),a=[o,r,s,String(c),l===null?`null`:l,u===null?`null`:u,String(t)].join(`;`);d.push(`${i}#${a}`)}),{id:e.chapterId,mangaId:e.sourceManga.mangaId,pages:d}}async fetchAccessToken(){try{return((await this.fetchJson({url:`${b}/reader/access-token`,method:`POST`,headers:{accept:`application/json`,"x-requested-with":`XMLHttpRequest`}})).token||``).trim()}catch{return``}}getMangaShareUrl(e){return this.mangaUrl(e)}hasNextPage(e){let t=e.page??1;return t<(e.totalPages??t)}mangaUrl(e){let t=this.safeDecode(e);return t.startsWith(`http`)?t:`${y}/series/${t.replace(/^\/+/,``)}`}parseChapterNumber(e){let t=e.match(/(\d+(?:\.\d+)?)/);return t?parseFloat(t[1]):0}parseDate(e){if(!e)return new Date(0);let t=Date.parse(e);return Number.isNaN(t)?new Date(0):new Date(t)}parseStatus(e){switch(e){case`ON_GOING`:return`Ongoing`;case`COMPLETED`:return`Completed`;default:return`Unknown`}}toSafeId(e){return e.replace(/[^A-Za-z0-9._\-@()[\]%?#+=/&:]/g,e=>{let t=encodeURIComponent(e);return t===e?`%`+e.charCodeAt(0).toString(16).toUpperCase().padStart(2,`0`):t})}safeDecode(e){try{return decodeURIComponent(e)}catch{return e}}absoluteUrl(e){let t=(e||``).trim();return t?t.startsWith(`http`)?t:t.startsWith(`//`)?`https:${t}`:t.startsWith(`/`)?`${y}${t}`:`${y}/${t}`:``}async cloudflareBypassCompleted(e,t,n){for(let e of this.cookieStorageInterceptor.cookies)this.cookieStorageInterceptor.deleteCookie(e);for(let e of t)e.expires&&e.expires.getTime()<=Date.now()||this.cookieStorageInterceptor.setCookie(e)}async fetchJson(e){let[t,n]=await Application.scheduleRequest(e);if(t.status===404)throw Error(`Content not found`);let r=Application.arrayBufferToUTF8String(n);return JSON.parse(r)}};async function T(e,t){let n=D(e,`;`,7);if(n.length<7)return t;let r=n[0],i=n[1]||`image/jpeg`,a=n[2],o=parseInt(n[3],10)||0,s=n[4],c=n[5],l=parseInt(n[6],10);if(Number.isNaN(l))return t;let u=s!==`null`&&s.length>0&&c!==`null`&&c.length>0,d=u?``:a;if(!u&&!a)return t;let f=E({imgB64:k(Application.base64Encode(t)),mimeType:i,isScrambled:r,gridSize:o,pageIndex:l,usePayload:u,payloadA:u?s:``,payloadB:u?c:``,chapterKeyB64:d}),p=await Application.executeInWebView({source:{html:`<html><head></head><body></body></html>`,baseUrl:y,loadCSS:!1,loadImages:!0},inject:f,storage:{cookies:[]}}),m=String(p.result||``);return m?A(Application.base64Decode(m)):t}function E(e){return`
(function(){
  return (async function(){
    var IMG_B64 = ${JSON.stringify(e.imgB64)};
    var MIME = ${JSON.stringify(e.mimeType)};
    var IS_SCRAMBLED = ${JSON.stringify(e.isScrambled)};
    var GRID = ${JSON.stringify(e.gridSize)};
    var PAGE_INDEX = ${JSON.stringify(e.pageIndex)};
    var USE_PAYLOAD = ${JSON.stringify(e.usePayload)};
    var PAYLOAD_A = ${JSON.stringify(e.payloadA)};
    var PAYLOAD_B = ${JSON.stringify(e.payloadB)};
    var CHAPTER_KEY_B64 = ${JSON.stringify(e.chapterKeyB64)};

    function b64ToBytes(b64){
      var bin = atob(b64);
      var out = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xFF;
      return out;
    }
    function bytesToB64(bytes){
      var bin = "";
      var chunk = 0x8000;
      for (var i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      return btoa(bin);
    }
    function strToBytes(s){
      var out = new Uint8Array(s.length);
      for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xFF;
      return out;
    }

    // HMAC-SHA256 helpers via WebCrypto.
    async function importHmacKey(keyBytes){
      return await crypto.subtle.importKey(
        "raw", keyBytes.buffer.slice(keyBytes.byteOffset, keyBytes.byteOffset + keyBytes.byteLength),
        { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    }
    async function hmac(keyObj, msgBytes){
      var sig = await crypto.subtle.sign("HMAC", keyObj,
        msgBytes.buffer.slice(msgBytes.byteOffset, msgBytes.byteOffset + msgBytes.byteLength));
      return new Uint8Array(sig);
    }

    function readU32LE(bytes, off){
      return ((bytes[off] | (bytes[off+1] << 8) | (bytes[off+2] << 16) | (bytes[off+3] << 24)) >>> 0);
    }
    function writeU32LE(bytes, off, val){
      bytes[off] = val & 0xFF;
      bytes[off+1] = (val >>> 8) & 0xFF;
      bytes[off+2] = (val >>> 16) & 0xFF;
      bytes[off+3] = (val >>> 24) & 0xFF;
    }
    function rotl(x, n){ return ((x << n) | (x >>> (32 - n))) >>> 0; }

    // --- ChaCha20 (RFC 8439 style, 12-byte nonce, 32-bit counter) ---
    function chachaBlock(keyBytes, nonceBytes, counter){
      var state = new Uint32Array(16);
      state[0]=0x61707865; state[1]=0x3320646e; state[2]=0x79622d32; state[3]=0x6b206574;
      for (var i = 0; i < 8; i++) state[4+i] = readU32LE(keyBytes, i*4);
      state[12] = counter >>> 0;
      state[13] = readU32LE(nonceBytes, 0);
      state[14] = readU32LE(nonceBytes, 4);
      state[15] = readU32LE(nonceBytes, 8);
      var w = state.slice(0);
      function qr(a,b,c,d){
        w[a]=(w[a]+w[b])>>>0; w[d]=rotl(w[d]^w[a],16);
        w[c]=(w[c]+w[d])>>>0; w[b]=rotl(w[b]^w[c],12);
        w[a]=(w[a]+w[b])>>>0; w[d]=rotl(w[d]^w[a],8);
        w[c]=(w[c]+w[d])>>>0; w[b]=rotl(w[b]^w[c],7);
      }
      for (var r = 0; r < 10; r++){
        qr(0,4,8,12); qr(1,5,9,13); qr(2,6,10,14); qr(3,7,11,15);
        qr(0,5,10,15); qr(1,6,11,12); qr(2,7,8,13); qr(3,4,9,14);
      }
      var block = new Uint8Array(64);
      for (var j = 0; j < 16; j++) writeU32LE(block, j*4, (w[j] + state[j]) >>> 0);
      return block;
    }

    try {
      // 1. Resolve the 32-byte chapter key.
      var chapterKey;
      if (USE_PAYLOAD) {
        var a = b64ToBytes(PAYLOAD_A);
        var b = b64ToBytes(PAYLOAD_B);
        chapterKey = new Uint8Array(32);
        for (var k = 0; k < 32; k++) chapterKey[k] = (a[k] ^ b[k]) & 0xFF;
      } else {
        chapterKey = b64ToBytes(CHAPTER_KEY_B64);
      }

      var raw = b64ToBytes(IMG_B64);
      if (raw.length < 4) return "";

      // 2. Detect scheme magic (ff02 AES-CTR, ff03 ChaCha20, ff04 AES-CTR v4).
      var isAes = raw[0] === 0xff && raw[1] === 0x02;
      var isChacha = raw[0] === 0xff && raw[1] === 0x03;
      var isAes4 = raw[0] === 0xff && raw[1] === 0x04;
      var hasMagic = isAes || isChacha || isAes4;
      var offset = hasMagic ? 2 : 0;
      if (raw.length < offset + 4) return "";

      // 3. 4-byte big-endian header: originalWidth, originalHeight.
      var originalWidth = ((raw[offset] << 8) | raw[offset+1]) & 0xFFFF;
      var originalHeight = ((raw[offset+2] << 8) | raw[offset+3]) & 0xFFFF;
      offset += 4;

      var body = raw.subarray(offset);
      var plain;
      var ckKey = await importHmacKey(chapterKey);

      if (isAes4 || isAes) {
        // AES-CTR with HMAC-derived per-page key, zero 16-byte counter.
        var prefix = isAes4 ? "aesctr4:" : "aesctr:";
        var derived = await hmac(ckKey, strToBytes(prefix + PAGE_INDEX));
        var aesKey = await crypto.subtle.importKey(
          "raw", derived.buffer.slice(0, derived.byteLength),
          { name: "AES-CTR" }, false, ["decrypt"]);
        var counter = new Uint8Array(16);
        var dec = await crypto.subtle.decrypt(
          { name: "AES-CTR", counter: counter.buffer, length: 128 },
          aesKey,
          body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength));
        plain = new Uint8Array(dec);
      } else if (isChacha) {
        var ccKeyBytes = await hmac(ckKey, strToBytes("cc:" + PAGE_INDEX));
        var nonce = new Uint8Array(12);
        plain = new Uint8Array(body.length);
        plain.set(body);
        var ctr = 0, off2 = 0;
        while (off2 < plain.length) {
          var blk = chachaBlock(ccKeyBytes, nonce, ctr++);
          var lim = Math.min(blk.length, plain.length - off2);
          for (var z = 0; z < lim; z++) plain[off2 + z] ^= blk[z];
          off2 += blk.length;
        }
      } else {
        // XOR keystream: HMAC-SHA256(chapterKey, "page:idx:block") per 32 bytes.
        plain = new Uint8Array(body.length);
        plain.set(body);
        var numBlocks = Math.ceil(plain.length / 32);
        for (var bi = 0; bi < numBlocks; bi++) {
          var h = await hmac(ckKey, strToBytes("page:" + PAGE_INDEX + ":" + bi));
          var base = bi * 32;
          var lim2 = Math.min(32, plain.length - base);
          for (var jj = 0; jj < lim2; jj++) plain[base + jj] ^= h[jj];
        }
      }

      // 4. Only ff02 / no-magic scrambled pages get tile unscramble.
      var doUnscramble = (IS_SCRAMBLED === "1") && !isChacha && !isAes4;
      if (!doUnscramble) {
        return bytesToB64(plain);
      }

      // Load the decrypted image into a canvas.
      var plainUrl = "data:" + MIME + ";base64," + bytesToB64(plain);
      var img = await new Promise(function(resolve, reject){
        var im = new Image();
        im.onload = function(){ resolve(im); };
        im.onerror = function(){ reject(new Error("img load")); };
        im.src = plainUrl;
      });

      var gridSize = GRID;
      var gridSq = gridSize * gridSize;
      var srcCanvas = document.createElement('canvas');
      srcCanvas.width = img.naturalWidth;
      srcCanvas.height = img.naturalHeight;
      var srcCtx = srcCanvas.getContext('2d');
      srcCtx.drawImage(img, 0, 0);

      var tileW = Math.floor(img.naturalWidth / gridSize);
      var tileH = Math.floor(img.naturalHeight / gridSize);

      // Reconstruct the permutation: identity, then Fisher-Yates driven by
      // HMAC(tilesSig, "perm:N") little-endian 32-bit randoms, where
      // tilesSig = HMAC(chapterKey, "tiles:idx").
      var c = new Array(gridSq);
      for (var ci = 0; ci < gridSq; ci++) c[ci] = ci;

      if (gridSq >= 2) {
        var tilesSig = await hmac(ckKey, strToBytes("tiles:" + PAGE_INDEX));
        var macKey = await importHmacKey(tilesSig);
        var nCounter = 0;
        var rBuf = new Uint8Array(0);
        var aIndex = 8;
        async function nextRandom(){
          if (aIndex >= 8) {
            rBuf = await hmac(macKey, strToBytes("perm:" + (nCounter++)));
            aIndex = 0;
          }
          var v = readU32LE(rBuf, aIndex * 4);
          aIndex++;
          return v >>> 0;
        }
        for (var idx = gridSq - 1; idx >= 1; idx--) {
          var r = await nextRandom();
          var swapIdx = r % (idx + 1);
          var tmp = c[idx]; c[idx] = c[swapIdx]; c[swapIdx] = tmp;
        }
      }

      // Inverse permutation: w[c[i]] = i.
      var wArr = new Array(gridSq);
      for (var wi = 0; wi < gridSq; wi++) wArr[c[wi]] = wi;

      var outCanvas = document.createElement('canvas');
      outCanvas.width = originalWidth || img.naturalWidth;
      outCanvas.height = originalHeight || img.naturalHeight;
      var outCtx = outCanvas.getContext('2d');

      for (var t = 0; t < gridSq; t++) {
        var srcIdx = wArr[t];
        var sx = (srcIdx % gridSize) * tileW;
        var sy = Math.floor(srcIdx / gridSize) * tileH;
        var dx = (t % gridSize) * tileW;
        var dy = Math.floor(t / gridSize) * tileH;
        outCtx.drawImage(srcCanvas, sx, sy, tileW, tileH, dx, dy, tileW, tileH);
      }

      var outMime = (MIME === "image/png") ? "image/png" : (MIME === "image/webp" ? "image/webp" : "image/jpeg");
      var quality = (outMime === "image/jpeg") ? 0.9 : 1.0;
      var outUrl = outCanvas.toDataURL(outMime, quality);
      var commaIdx = outUrl.indexOf(",");
      return commaIdx >= 0 ? outUrl.slice(commaIdx + 1) : "";
    } catch (e) {
      return "";
    }
  })();
})()
`}function D(e,t,n){let r=[],i=e;for(;r.length<n-1;){let e=i.indexOf(t);if(e<0)break;r.push(i.slice(0,e)),i=i.slice(e+t.length)}return r.push(i),r}function O(e){let t=e,n=t.indexOf(`://`);n>=0&&(t=t.slice(n+3));let r=t.indexOf(`/`);t=r>=0?t.slice(r+1):``;let i=t.indexOf(`?`);i>=0&&(t=t.slice(0,i));let a=t.split(`/`).filter(e=>e.length>0);return a.length>0?a[a.length-1]:``}function k(e){return typeof e==`string`?e:Application.arrayBufferToUTF8String(e)}function A(e){if(typeof e==`string`){let t=new Uint8Array(e.length);for(let n=0;n<e.length;n++)t[n]=e.charCodeAt(n)&255;return t.buffer}return e}return e.PhiliaScans=new w,e.PhiliaScansExtension=w,e})({});