var source=(function(e){Object.defineProperty(e,Symbol.toStringTag,{value:`Module`});function t(e){"@babel/helpers - typeof";return t=typeof Symbol==`function`&&typeof Symbol.iterator==`symbol`?function(e){return typeof e}:function(e){return e&&typeof Symbol==`function`&&e.constructor===Symbol&&e!==Symbol.prototype?`symbol`:typeof e},t(e)}function n(e,n){if(t(e)!=`object`||!e)return e;var r=e[Symbol.toPrimitive];if(r!==void 0){var i=r.call(e,n||`default`);if(t(i)!=`object`)return i;throw TypeError(`@@toPrimitive must return a primitive value.`)}return(n===`string`?String:Number)(e)}function r(e){var r=n(e,`string`);return t(r)==`symbol`?r:r+``}function i(e,t,n){return(t=r(t))in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}var a=class{constructor(e){i(this,`id`,void 0),this.id=e}registerInterceptor(){Application.registerInterceptor(this.id,Application.Selector(this,`interceptRequest`),Application.Selector(this,`interceptResponse`))}unregisterInterceptor(){Application.unregisterInterceptor(this.id)}};let o={},s={},c=async e=>{if(o[e]){await o[e],await c(e);return}o[e]=new Promise(t=>s[e]=()=>{delete o[e],t()})},l=e=>{s[e]&&s[e]()};var u=class extends a{constructor(e,t){super(e),i(this,`options`,void 0),i(this,`promise`,void 0),i(this,`currentRequestsMade`,0),i(this,`lastReset`,Date.now()),i(this,`imageRegex`,new RegExp(/\.(avif|gif|jpeg|jpg|jxl|png|webp)(\?|$)/i)),this.options=t}async interceptRequest(e){return this.options.ignoreImages&&this.imageRegex.test(e.url)?e:(await c(this.id),await this.incrementRequestCount(),l(this.id),e)}async interceptResponse(e,t,n){return n}async incrementRequestCount(){if(await this.promise,(Date.now()-this.lastReset)/1e3>this.options.bufferInterval&&(this.currentRequestsMade=0,this.lastReset=Date.now()),this.currentRequestsMade+=1,this.currentRequestsMade>=this.options.numberOfRequests){let e=(Date.now()-this.lastReset)/1e3;if(e<=this.options.bufferInterval){let t=this.options.bufferInterval-e;console.log(`[BasicRateLimiter] rate limit hit, sleeping for ${t}`),this.promise=Application.sleep(t)}}}},d=class extends Error{constructor(e,t=`Cloudflare bypass is required`){super(t),i(this,`resolutionRequest`,void 0),i(this,`type`,`cloudflareError`),this.resolutionRequest=e}};function f(e){let t={},n=e.match(/^(?:([a-zA-Z][a-zA-Z\d+\-.]*):)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/);if(!n)throw Error(`Invalid URL string provided.`);if(n[1]!==void 0&&n[1]!==``&&(t.protocol=n[1]),n[2]!==void 0&&n[2]!==``){let e=n[2],r=``,i=``,a=e.indexOf(`@`);if(a!==-1){if(r=e.substring(0,a),i=e.substring(a+1),r!==``){let e=r.indexOf(`:`);e===-1?(t.username=r,t.password=``):(t.username=r.substring(0,e),t.password=r.substring(e+1))}}else i=e;if(i!==``)if(i.startsWith(`[`)){let e=i.indexOf(`]`);if(e===-1)throw Error(`Invalid IPv6 address in URL update.`);t.hostname=i.substring(0,e+1);let n=i.substring(e+1);n.startsWith(`:`)&&(t.port=n.substring(1))}else{let e=i.lastIndexOf(`:`);e!==-1&&i.indexOf(`:`)===e?(t.hostname=i.substring(0,e),t.port=i.substring(e+1)):(t.hostname=i,t.port=``)}}if(n[3]!==void 0&&n[3]!==``&&(t.path=n[3].startsWith(`/`)?n[3]:`/${n[3]}`),n[4]!==void 0){let e={},r=n[4].split(`&`);for(let t of r){if(!t)continue;let[n,r=``]=t.split(`=`);if(n===void 0)continue;let i=decodeURIComponent(n),a=decodeURIComponent(r);if(i in e){let t=e[i];Array.isArray(t)?t.push(a):e[i]=[t,a]}else e[i]=a}t.queryItems=e}return n[5]!==void 0&&(t.fragment=n[5]),t}var p=class{constructor(e){i(this,`protocol`,void 0),i(this,`hostname`,void 0),i(this,`path`,void 0),i(this,`username`,void 0),i(this,`password`,void 0),i(this,`port`,void 0),i(this,`queryItems`,void 0),i(this,`fragment`,void 0);let t=f(e);if(!t.hostname||!t.protocol)throw Error(`URL Hostname and Protocol are required`);this.hostname=t.hostname,this.protocol=t.protocol,this.path=t.path??``,this.username=t.username,this.password=t.password,this.port=t.port,this.queryItems=t.queryItems,this.fragment=t.fragment}toString(){let e=`${this.protocol}://`;if(this.username!==void 0&&this.username!==``&&(e+=this.username,this.password!==void 0&&this.password!==``&&(e+=`:${this.password}`),e+=`@`),e+=this.hostname,this.port!==void 0&&this.port!==``&&(e+=`:${this.port}`),this.path!==``&&(e+=this.path.startsWith(`/`)?this.path:`/${this.path}`),this.queryItems!==void 0){let t=Object.keys(this.queryItems),n=[];if(t.length>0)for(let e of t){let t=this.queryItems[e];if(Array.isArray(t))for(let r of t)n.push(`${encodeURIComponent(e)}=${encodeURIComponent(r)}`);else t!==void 0&&n.push(`${encodeURIComponent(e)}=${encodeURIComponent(t)}`)}e+=`?${n.join(`&`)}`}return this.fragment!==void 0&&(e+=`#${this.fragment}`),e}setProtocol(e){if(e===``)throw Error(`Protocol is required`);return this.protocol=e,this}setUsername(e){return e===``?this.username=void 0:this.username=e,this}setPassword(e){return e===``?this.password=void 0:this.password=e,this}setHostname(e){if(e===``)throw Error(`Hostname is required`);return this.hostname=e,this}setPort(e){return e===``?this.port=void 0:this.port=e,this}setPath(e){return this.path=e.startsWith(`/`)?e:`/${e}`,this}addPathComponent(e){return this.path=(this.path??``)+(e.startsWith(`/`)?e:`/${e}`),this}setQueryItems(e){return this.queryItems=e,this}setQueryItem(e,t){return this.queryItems===void 0&&(this.queryItems={}),this.queryItems[e]=t,this}removeQueryItem(e){return delete this.queryItems?.[e],this}setFragment(e){return this.fragment=e,this}update(e){let t;return t=typeof e==`string`?f(e):e,t.protocol!==void 0&&this.setProtocol(t.protocol),t.username!==void 0&&this.setUsername(t.username),t.password!==void 0&&this.setPassword(t.password),t.hostname!==void 0&&this.setHostname(t.hostname),t.port!==void 0&&this.setPort(t.port),t.path!==void 0&&this.setPath(t.path),t.queryItems!==void 0&&this.setQueryItems(t.queryItems),t.fragment!==void 0&&this.setFragment(t.fragment),this}};let m=`cookie_store_cookies`;var h=class extends a{get cookies(){return Object.freeze(Object.values(this._cookies))}set cookies(e){let t={};for(let n of e)this.isCookieExpired(n)||(t[this.cookieIdentifier(n)]=n);this._cookies=t,this.saveCookiesToStorage()}constructor(e){super(`cookie_store`),i(this,`options`,void 0),i(this,`_cookies`,{}),this.options=e,this.loadCookiesFromStorage()}async interceptRequest(e){return e.cookies={...e.cookies??{},...this.cookiesForUrl(e.url).reduce((e,t)=>(e[t.name]=t.value,e),{})},e}async interceptResponse(e,t,n){let r=this._cookies;for(let e of t.cookies){let t=this.cookieIdentifier(e);if(this.isCookieExpired(e)){delete r[t];continue}r[t]=e}return this._cookies=r,this.saveCookiesToStorage(),n}setCookie(e){this.isCookieExpired(e)||(this._cookies[this.cookieIdentifier(e)]=e,this.saveCookiesToStorage())}deleteCookie(e){delete this._cookies[this.cookieIdentifier(e)]}cookiesForUrl(e){let t=new p(e),n=t.hostname;if(!n)return[];let r={},i=t.path.startsWith(`/`)?t.path:`/${t.path}`,a=n.split(`.`),o=i.split(`/`);o.shift();let s=this.cookies;for(let e of s){if(this.isCookieExpired(e)){delete this._cookies[this.cookieIdentifier(e)];continue}let t=this.cookieSanitizedDomain(e).split(`.`);if(a.length<t.length||t.length==0)continue;let n=!0;for(let e=0;e<t.length;e++){let r=t.length-1-e,i=a.length-1-e;if(t[r]!=a[i]){n=!1;break}}if(!n)continue;let s=this.cookieSanitizedPath(e),c=s.split(`/`);c.shift();let l=0;if(i===s)l=2**53-1;else if(c.length===0||s===`/`)l=1;else if(i.startsWith(s)&&o.length>=c.length)for(let e=0;e<c.length&&c[e]===o[e];e++)l+=1;l<=0||(r[e.name]?.pathMatches??0)<l&&(r[e.name]={cookie:e,pathMatches:l})}return Object.values(r).map(e=>e.cookie)}cookieIdentifier(e){return`${e.name}-${this.cookieSanitizedDomain(e)}-${this.cookieSanitizedPath(e)}`}cookieSanitizedPath(e){return e.path?.startsWith(`/`)?e.path:`/`+(e.path??``)}cookieSanitizedDomain(e){return e.domain.replace(/^(www)?\.?/gi,``).toLowerCase()}isCookieExpired(e){return!!(e.expires&&e.expires.getTime()<=Date.now())}loadCookiesFromStorage(){if(this.options.storage==`memory`)return;let e=Application.getState(m);if(!e){this._cookies={};return}let t={};for(let n of e)!n.expires||this.isCookieExpired(n)||(t[this.cookieIdentifier(n)]=n);this._cookies=t}saveCookiesToStorage(){this.options.storage!=`memory`&&Application.setState(this.cookies.filter(e=>e.expires),m)}},g;(function(e){e[e.NONE=0]=`NONE`,e[e.MANGA_CHAPTERS=1]=`MANGA_CHAPTERS`,e[e.CHAPTER_PROVIDING=1]=`CHAPTER_PROVIDING`,e[e.MANGA_PROGRESS=2]=`MANGA_PROGRESS`,e[e.MANGA_PROGRESS_PROVIDING=2]=`MANGA_PROGRESS_PROVIDING`,e[e.PROGRESS_PROVIDING=2]=`PROGRESS_PROVIDING`,e[e.DISCOVER_SECIONS=4]=`DISCOVER_SECIONS`,e[e.DISCOVER_SECIONS_PROVIDING=4]=`DISCOVER_SECIONS_PROVIDING`,e[e.DISCOVER_SECTION_PROVIDING=4]=`DISCOVER_SECTION_PROVIDING`,e[e.COLLECTION_MANAGEMENT=8]=`COLLECTION_MANAGEMENT`,e[e.MANAGED_COLLECTION_PROVIDING=8]=`MANAGED_COLLECTION_PROVIDING`,e[e.CLOUDFLARE_BYPASS_REQUIRED=16]=`CLOUDFLARE_BYPASS_REQUIRED`,e[e.CLOUDFLARE_BYPASS_PROVIDING=16]=`CLOUDFLARE_BYPASS_PROVIDING`,e[e.SETTINGS_UI=32]=`SETTINGS_UI`,e[e.SETTINGS_FORM_PROVIDING=32]=`SETTINGS_FORM_PROVIDING`,e[e.MANGA_SEARCH=64]=`MANGA_SEARCH`,e[e.SEARCH_RESULTS_PROVIDING=64]=`SEARCH_RESULTS_PROVIDING`,e[e.SEARCH_RESULT_PROVIDING=64]=`SEARCH_RESULT_PROVIDING`})(g||(g={}));var _;(function(e){e.EVERYONE=`SAFE`,e.MATURE=`MATURE`,e.ADULT=`ADULT`})(_||(_={}));var v;(function(e){e[e.featured=0]=`featured`,e[e.simpleCarousel=1]=`simpleCarousel`,e[e.prominentCarousel=2]=`prominentCarousel`,e[e.chapterUpdates=3]=`chapterUpdates`,e[e.genres=4]=`genres`})(v||(v={})),Object.freeze({items:[],metadata:void 0});let y=`https://emaqi.com`,b=`https://api.emaqi.com/graphql`,x=[{name:`Shonen`,slug:`shonen`},{name:`Shojo`,slug:`shojo`},{name:`Seinen`,slug:`seinen`},{name:`Kids`,slug:`kids`},{name:`Josei`,slug:`josei`},{name:`Artbook`,slug:`artbook`},{name:`Free One-Shot`,slug:`one-shot`},{name:`BL / Yaoi`,slug:`bl`},{name:`Thriller`,slug:`suspense`},{name:`Mystery`,slug:`mystery`},{name:`Adventure`,slug:`adventure`},{name:`Drama`,slug:`drama`},{name:`GL / Yuri`,slug:`yuri`},{name:`Sports`,slug:`sports`},{name:`Food`,slug:`food`},{name:`Sci-fi`,slug:`sci-fi`},{name:`Isekai`,slug:`isekai`},{name:`Action`,slug:`action`},{name:`Fantasy`,slug:`fantasy`},{name:`Horror`,slug:`horror`},{name:`Romance`,slug:`romance`},{name:`Comedy`,slug:`comedy`},{name:`Death Game`,slug:`death-game`},{name:`War`,slug:`war`},{name:`Rom-com`,slug:`rom-com`},{name:`Travel`,slug:`travel`},{name:`Nature`,slug:`nature`},{name:`Showbiz`,slug:`showbiz`},{name:`Educational`,slug:`educational`},{name:`Medical`,slug:`medical`},{name:`Animal`,slug:`animal`},{name:`Slice of Life`,slug:`slice-of-life`},{name:`Supernatural`,slug:`supernatural`},{name:`Art`,slug:`art`},{name:`Gamble`,slug:`gamble`},{name:`Depressing`,slug:`depressing`},{name:`Professional`,slug:`profession`},{name:`Survival`,slug:`survival`},{name:`Hobby`,slug:`hobby`},{name:`History`,slug:`history`}];var S=class extends a{async interceptRequest(e){return e.headers={...e.headers,referer:`${y}/`,origin:y,"user-agent":await Application.getDefaultUserAgent(),accept:`application/json, text/plain, */*`,"accept-language":`en-US,en;q=0.5`},e}async interceptResponse(e,t,n){if(t.headers?.[`cf-mitigated`]===`challenge`)throw new d({url:e.url,method:e.method??`GET`,headers:{"user-agent":await Application.getDefaultUserAgent()}});let r=e.url.split(`#`).slice(1).join(`#`);if(!r||!r.includes(`:`)||e.url.startsWith(b))return n;try{return await E(r,n)}catch{return n}}},C=class{constructor(){i(this,`requestManager`,new S(`main`)),i(this,`cookieStorageInterceptor`,new h({storage:`stateManager`})),i(this,`globalRateLimiter`,new u(`rateLimiter`,{numberOfRequests:2,bufferInterval:1,ignoreImages:!0}))}async initialise(){this.requestManager.registerInterceptor(),this.cookieStorageInterceptor.registerInterceptor(),this.globalRateLimiter.registerInterceptor()}async getDiscoverSections(){return[{id:`this-week-s-bestsellers`,title:`This Week's Bestsellers`,type:v.featured},{id:`hot-release`,title:`Hot Releases`,type:v.simpleCarousel},{id:`genres`,title:`Genres`,type:v.genres}]}async getDiscoverSectionItems(e,t){if(e.id===`genres`)return{items:x.map(e=>({type:`genresCarouselItem`,name:e.name,searchQuery:{title:``,metadata:{genre:e.slug}},metadata:void 0})),metadata:void 0};let n=t?.cursor??null,r=(await this.graphQL(`query FetchHomeSection($slug: String!, $mangaAfter: String) {
  homeSection(slug: $slug) {
    mangaConn(first: 40, after: $mangaAfter) {
      edges { node { comic { comicId slug title cover { url } } } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`,`FetchHomeSection`,{slug:e.id,mangaAfter:n})).homeSection?.mangaConn,i=[];for(let t of r?.edges??[]){let n=t.node.comic;i.push({type:e.id===`this-week-s-bestsellers`?`featuredCarouselItem`:`simpleCarouselItem`,mangaId:this.buildMangaId(n),imageUrl:n.cover?.url??``,title:n.title,metadata:void 0})}return{items:i,metadata:r?.pageInfo.hasNextPage&&r.pageInfo.endCursor?{cursor:r.pageInfo.endCursor}:void 0}}async getSearchResults(e,t){let n=(e.title||``).trim();if(n!==``)return{items:((await this.graphQL(`query Search($input: SearchInput!) {
  search(input: $input) { comicId title slug cover { url } }
}`,`Search`,{input:{keyword:n}})).search??[]).map(e=>({mangaId:this.buildMangaId(e),imageUrl:e.cover?.url??``,title:e.title,subtitle:void 0,metadata:void 0})),metadata:void 0};let r=e.metadata?.genre,i=t,a=i?.genre??r??x[0].slug,o=i?.cursor??null,s=(await this.graphQL(`query FetchGenre($slug: String!, $mangaAfter: String) {
  genre(slug: $slug) {
    mangaConn(first: 40, after: $mangaAfter) {
      edges { node { comic { comicId slug title cover { url } } } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`,`FetchGenre`,{slug:a,mangaAfter:o})).genre?.mangaConn,c=[];for(let e of s?.edges??[]){let t=e.node.comic;c.push({mangaId:this.buildMangaId(t),imageUrl:t.cover?.url??``,title:t.title,subtitle:void 0,metadata:void 0})}return{items:c,metadata:s?.pageInfo.hasNextPage&&s.pageInfo.endCursor?{genre:a,cursor:s.pageInfo.endCursor}:void 0}}async getMangaDetails(e){let{comicId:t}=this.parseMangaId(e),n=(await this.graphQL(`query FetchMangaStatus($comicId: String!) {
  manga(comicId: $comicId) {
    comic {
      title synopsis rating creators publisher
      metadata { completed }
      cover { url }
      genres { ... on Tag { name } }
    }
  }
}`,`FetchMangaStatus`,{comicId:t})).manga.comic,r=[];n.synopsis&&r.push(n.synopsis),n.publisher&&n.publisher.length>0&&r.push(`Publisher: ${n.publisher}`),n.rating!=null&&r.push(`Age limit: ${n.rating}+`);let i=r.join(`

`),a=(n.creators??[]).join(`, `),o=(n.genres??[]).map(e=>e.name??``).filter(e=>e.length>0),s=[];return o.length>0&&s.push({id:`genres`,title:`Genres`,tags:o.map(e=>({id:e.toLowerCase().replace(/\s+/g,`-`),title:e}))}),{mangaId:e,mangaInfo:{primaryTitle:n.title,secondaryTitles:[],thumbnailUrl:n.cover?.url??``,author:a.length>0?a:void 0,artist:a.length>0?a:void 0,synopsis:i,contentRating:_.MATURE,status:n.metadata?.completed===!0?`Completed`:`Ongoing`,tagGroups:s,shareUrl:this.mangaUrl(e)}}}async getChapters(e){let{comicId:t,slug:n}=this.parseMangaId(e.mangaId),r=await this.graphQL(`query FetchComicData($comicId: String!) {
  comicVolumes(comicId: $comicId) {
    volumes { comicId trialPage slug volumeNumber name price purchased free releasesAt }
  }
  chapters(comicId: $comicId) {
    comicId chapterNumber name purchased free releasesAt
  }
}`,`FetchComicData`,{comicId:t}),i=[],a=(r.chapters??[]).map(t=>this.chapterFromEntry(e,t,n));a.reverse(),i.push(...a);let o=(r.comicVolumes?.volumes??[]).map(t=>this.volumeFromEntry(e,t,n));return o.reverse(),i.push(...o),i}chapterFromEntry(e,t,n){let r=t.purchased===!1&&t.free===!1?`🔒 `:``,i=t.chapterNumber??-1;return{chapterId:`${t.comicId}/chapter/${i}/${n}`,sourceManga:e,title:r+t.name,volume:0,chapNum:i,publishDate:this.parseDate(t.releasesAt),langCode:`🇬🇧`}}volumeFromEntry(e,t,n){let r=t.purchased===!1&&t.free===!1,i=r&&t.trialPage!=null&&t.trialPage>0,a=r?`🔒 `:``,o=i?`(Preview) `:``,s=t.volumeNumber??-1;return{chapterId:`${t.comicId}/volume/${s}/${n}/${t.slug}`,sourceManga:e,title:a+o+t.name,volume:0,chapNum:s,publishDate:this.parseDate(t.releasesAt),langCode:`🇬🇧`}}async getChapterDetails(e){let t=this.safeDecode(e.chapterId).split(`/`),n=t[0]??``,r=t[1]??``,i=parseInt(t[2]??`0`,10),{publicKeyB64:a,privateKeyB64Url:o}=await T(),s;s=r===`chapter`?await this.graphQL(`query FetchChapterContents($comicId: String!, $chapterNumber: Int!) {
  chapter(comicId: $comicId, chapterNumber: $chapterNumber) {
    contents { pages { url } hash }
  }
}`,`FetchChapterContents`,{comicId:n,chapterNumber:i},{"X-Hash":a}):await this.graphQL(`query FetchMangaContents($comicId: String!, $volumeNumber: Int!) {
  manga(comicId: $comicId, volumeNumber: $volumeNumber) {
    contents { pages { url } hash }
  }
}`,`FetchMangaContents`,{comicId:n,volumeNumber:i},{"X-Hash":a});let c=s.chapter?.contents??s.manga?.contents??null;if(!c||c.pages.length===0)throw Error(`No page contents returned. This title likely requires a purchase/login. Locked content cannot be unlocked without an account that owns it.`);let l=c.hash,u=c.pages.map(e=>`${e.url}#${o}:${l}`);return{id:e.chapterId,mangaId:e.sourceManga.mangaId,pages:u}}getMangaShareUrl(e){return this.mangaUrl(e)}buildMangaId(e){return`${e.comicId}#${e.slug}`}parseMangaId(e){let t=this.safeDecode(e),n=t.indexOf(`#`);return n===-1?{comicId:t,slug:``}:{comicId:t.slice(0,n),slug:t.slice(n+1)}}mangaUrl(e){let{slug:t}=this.parseMangaId(e);return`${y}/manga/${t}`}safeDecode(e){try{return decodeURIComponent(e)}catch{return e}}parseDate(e){if(!e)return new Date(0);let t=Date.parse(e);return Number.isNaN(t)?new Date(0):new Date(t)}async graphQL(e,t,n,r){let i=JSON.stringify({query:e,operationName:t,variables:n}),a={url:b,method:`POST`,headers:{"content-type":`application/json`,...r},body:i},[o,s]=await Application.scheduleRequest(a);if(o.status===404)throw Error(`Content not found`);let c=Application.arrayBufferToUTF8String(s),l=JSON.parse(c);if(l.errors&&l.errors.length>0){let e=l.errors.map(e=>e.message??``).filter(e=>e.length>0).join(`
`);throw Error(e||`GraphQL error`)}if(!l.data)throw Error(`GraphQL response is missing the 'data' field`);return l.data}async cloudflareBypassCompleted(e,t,n){for(let e of this.cookieStorageInterceptor.cookies)this.cookieStorageInterceptor.deleteCookie(e);for(let e of t)e.expires&&e.expires.getTime()<=Date.now()||this.cookieStorageInterceptor.setCookie(e)}};let w={html:`<html><head></head><body></body></html>`,baseUrl:y,loadCSS:!1,loadImages:!1};async function T(){let e=await Application.executeInWebView({source:w,inject:`
(function () {
  return new Promise(function (resolve) {
    function abToB64(buf) {
      var bytes = new Uint8Array(buf);
      var s = "";
      for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      return btoa(s);
    }
    crypto.subtle.generateKey(
      { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["encrypt", "decrypt"]
    ).then(function (pair) {
      return Promise.all([
        crypto.subtle.exportKey("spki", pair.publicKey),
        crypto.subtle.exportKey("pkcs8", pair.privateKey),
      ]);
    }).then(function (keys) {
      var pub = abToB64(keys[0]);
      var priv = abToB64(keys[1]).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
      resolve(JSON.stringify({ pub: pub, priv: priv }));
    }).catch(function () { resolve(""); });
  });
})()
`,storage:{cookies:[]}}),t=JSON.parse(String(e.result||`{}`));if(typeof t==`object`&&t&&`pub`in t&&`priv`in t&&typeof t.pub==`string`&&typeof t.priv==`string`){let e=t;if(e.pub&&e.priv)return{publicKeyB64:e.pub,privateKeyB64Url:e.priv}}throw Error(`Failed to generate RSA keypair`)}async function E(e,t){let n=e.indexOf(`:`);if(n<0)return t;let r=e.slice(0,n),i=e.slice(n+1);if(!r||!i)return t;let a=D(t),o=`
(function () {
  return new Promise(function (resolve) {
    var PRIV = ${JSON.stringify(r)};
    var HASH = ${JSON.stringify(i)};
    var IMG = ${JSON.stringify(a)};

    function b64ToBytes(b64) {
      var bin = atob(b64);
      var out = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    function b64UrlToBytes(b64) {
      var s = b64.replace(/-/g, "+").replace(/_/g, "/");
      while (s.length % 4) s += "=";
      return b64ToBytes(s);
    }
    function bytesToB64(bytes) {
      var s = "";
      for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      return btoa(s);
    }

    try {
      var privBytes = b64UrlToBytes(PRIV);
      var hashBytes = b64ToBytes(HASH);
      var img = b64ToBytes(IMG);

      crypto.subtle.importKey(
        "pkcs8", privBytes.buffer,
        { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]
      ).then(function (rsaKey) {
        return crypto.subtle.decrypt({ name: "RSA-OAEP" }, rsaKey, hashBytes.buffer);
      }).then(function (aesKeyBuf) {
        var aesKey = new Uint8Array(aesKeyBuf);
        var magic = img[0];
        if (magic === 2) {
          var ivG = img.slice(2, 18);
          var ctG = img.slice(18);
          return crypto.subtle.importKey("raw", aesKey.buffer, { name: "AES-GCM" }, false, ["decrypt"])
            .then(function (k) {
              return crypto.subtle.decrypt({ name: "AES-GCM", iv: ivG.buffer, tagLength: 128 }, k, ctG.buffer);
            });
        } else {
          var iv = new Uint8Array(16);
          iv[0] = magic;
          var rest = img.slice(1, 16);
          iv.set(rest, 1);
          var ctC = img.slice(16);
          return crypto.subtle.importKey("raw", aesKey.buffer, { name: "AES-CBC" }, false, ["decrypt"])
            .then(function (k) {
              return crypto.subtle.decrypt({ name: "AES-CBC", iv: iv.buffer }, k, ctC.buffer);
            });
        }
      }).then(function (plainBuf) {
        resolve(bytesToB64(new Uint8Array(plainBuf)));
      }).catch(function () { resolve(""); });
    } catch (e) { resolve(""); }
  });
})()
`,s=await Application.executeInWebView({source:w,inject:o,storage:{cookies:[]}}),c=String(s.result||``);return c?O(c):t}function D(e){let t=Application.base64Encode(e);return typeof t==`string`?t:Application.arrayBufferToUTF8String(t)}function O(e){let t=Application.base64Decode(e);if(typeof t==`string`){let e=new Uint8Array(t.length);for(let n=0;n<t.length;n++)e[n]=t.charCodeAt(n);return e.buffer}return t}let k=new C;return e.EmaqiExtension=C,e.emaqi=k,e})({});