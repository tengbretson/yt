import { format, parse, UrlWithParsedQuery, resolve } from 'url';
import * as querystring from 'querystring';
import { identity, last, split, pipe, path } from 'ramda';
import { Either, either, right, left, fromOption } from 'fp-ts/lib/Either';
import { task } from 'fp-ts/lib/Task';
import { Option, some, none, fromNullable, tryCatch as tryCatchO } from 'fp-ts/lib/Option';
import { fromEither, tryCatch, TaskEither } from 'fp-ts/lib/TaskEither';
import { JSDOM, DOMWindow } from 'jsdom';

interface VideoJSON {
  params: {
    allowscriptaccess: string;
    allowfullscreen: string;
    bgcolor: string;
  };
  args: {
    keywords: string;
    pyv_ad_channel: string;
    of: string;
    mpu: boolean;
    serialized_ad_ux_config: string;
    enabled_engage_types: string;
    iv_invideo_url: string;
    account_playback_token: string;
    fade_out_duration_milliseconds: string;
    idpj: string;
    allow_below_the_player_companion: boolean;
    enablecsi: string;
    show_content_thumbnail: boolean;
    videostats_playback_base_url: string;
    invideo: boolean;
    fflags: string;
    atc: string;
    shortform: boolean;
    allow_ratings: string;
    cosver: string;
    is_listed: string;
    t: string;
    length_seconds: string;
    mpvid: string;
    allow_embed: string;
    vid: string;
    title: string;
    thumbnail_url: string;
    ad3_module: string;
    cafe_experiment_id: string;
    gpt_migration: string;
    cos: string;
    eventid: string;
    ps: string;
    loeid: string;
    cver: string;
    watermark: string;
    sffb: boolean;
    author: string;
    loudness: string;
    storyboard_spec: string;
    video_id: string;
    tmi: string;
    itct: string;
    remarketing_url: string;
    uid: string;
    ad_flags: string;
    gapi_hint_params: string;
    midroll_freqcap: string;
    view_count: string;
    iv_load_policy: string;
    avg_rating: string;
    adaptive_fmts: string;
    hl: string;
    apiary_host_firstparty: string;
    instream_long: boolean;
    loaderUrl: string;
    player_error_log_fraction: string;
    url_encoded_fmt_stream_map: string;
    ldpj: string;
    iv3_module: string;
    ptchn: string;
    fmt_list: string;
    rmktEnabled: string;
    apply_fade_on_midrolls: boolean;
    oid: string;
    vm: string;
    as_launched_in_country: string;
    pltype: string;
    enablejsapi: string;
    fade_in_start_milliseconds: string;
    afv: boolean;
    innertube_api_key: string;
    ssl: string;
    ad_logging_flag: string;
    host_language: string;
    relative_loudness: string;
    encoded_ad_safety_reason: string;
    ad_device: string;
    allow_html5_ads: string;
    show_pyv_in_related: boolean;
    fexp: string;
    fade_in_duration_milliseconds: string;
    cid: string;
    ptk: string;
    xhr_apiary_host: string;
    no_get_video_log: string;
    cbrver: string;
    csi_page_type: string;
    player_response: string;
    ad_tag: string;
    fade_out_start_milliseconds: string;
    focEnabled: string;
    core_dbp: string;
    adsense_video_doc_id: string;
    vmap: string;
    ppv_remarketing_url: string;
    afv_ad_tag: string;
    external_play_video: string;
    token: string;
    ismb: string;
    dclk: boolean;
    ucid: string;
    vss_host: string;
    apiary_host: string;
    innertube_api_version: string;
    tag_for_child_directed: boolean;
    ad_slots: string;
    plid: string;
    innertube_context_client_version: string;
    midroll_prefetch_size: string;
    baseUrl: string;
    cbr: string;
    cr: string;
    timestamp: string;
    dbp: string;
    c: string;
    cl: string;
    gut_tag: string;
  };
  assets: {
    css: string;
    js: string;
  };
  attrs: {
    id: string;
  };
  sts: number;
  html5: boolean;
  url: string;
};

const KEYS_TO_SPLIT = [
  'keywords',
  'fmt_list',
  'fexp',
  'watermark'
];

const INFO_HOST = 'www.youtube.com';
const INFO_PATH = '/get_video_info';
const VIDEO_EURL = 'https://youtube.googleapis.com/v/';

const authorRegexp = /<a href="\/channel\/([\w-]+)"[^>]+>(.+?(?=<\/a>))/;
const aliasRegExp = /<a href="\/user\/([^"]+)/;

const swap = <T, U>(e: Either<T, U>) => e.swap();

const wrangle_error = (error: any) => error instanceof Error ? error : new Error(error.toString());

const to_text = (res: Response) => res.text();

const tee = <T>(fn: (val: T) => any) => (val: T) => (fn(val), val);

const reject_failures = (res: Response) => res.status < 400 ? res :
  Promise.reject<Response>(new Error(res.statusText));

const between = (left: string) => (right: string) => (haystack: string): Option<string> => {
  const left_pos = haystack.indexOf(left);
  if (left_pos === -1) return none;
  const trimmed = haystack.slice(left_pos + left.length);
  const right_pos = haystack.indexOf(right);
  if (right_pos === -1) return none;
  return some(trimmed.slice(0, right_pos));
};

const isValidID = (id: string) => /^[a-zA-Z0-9-_]{11}$/.test(id);
const isShortUrl = (url: string) => /^(www\.){0,1}youtu\.be/.test(url);

const parseUrl = (url: string) => parse(url, true);

const getURLVideoID = ({ query, hostname, pathname }: UrlWithParsedQuery): Either<Error, string> =>
  fromOption(new Error('Invalid video id'))(
    fromNullable(path<string>(['v'], query))
      .filter(isValidID));

const getVideoPage = (id: string): TaskEither<Error, JSDOM> =>
  tryCatch(() =>
    fetch(`https://www.youtube.com/watch?v=${id}`)
      .then(reject_failures)
      .then(to_text)
      .then(body => new JSDOM(body)), wrangle_error);
      

const isUnavailable = (page: JSDOM): Option<Error> => {
  const warning = page.window.document.querySelector('#player-unavailable');

  return none;
}


  // between('<div id="player-unavailable"')('>')(page)
  //   .chain(between('class="')('"'))
  //   .chain(message => {
  //     if (!/\bhid\b/.test(message) && !page.includes('<div id="watch7-player-age-gate-content"')) {
  //       return some(new Error(between('<h1 id="unavailable-message" class="message">')('</h1>')(page)
  //         .getOrElse('Unknown error').trim()))
  //     } else {
  //       return none;
  //     }
  //   });

const getVideoJson = (page: JSDOM): Either<Error, VideoJSON> => {
  return left<Error, VideoJSON>(new Error('Fake news'))
}
  // fromOption(new Error('Failed to parse video data'))(
  //   between('ytplayer.config = ')('</script>')(page)
  //     .chain(json_string => tryCatchO(() =>
  //       JSON.parse(json_string.slice(0, json_string.lastIndexOf(';ytplayer.load'))))));

const getVideoInfo = ({ sts, args: { video_id: id } }: VideoJSON) =>
  tryCatch(() => fetch(format({
    protocol: 'https',
    host: INFO_HOST,
    pathname: INFO_PATH,
    query: {
      video_id: id,
      eurl: VIDEO_EURL + id,
      ps: 'default',
      gl: 'US',
      hl: 'en',
      sts
    },
  }))
    .then(reject_failures)
    .then(to_text), wrangle_error);

addEventListener('fetch', (e: any) => {
  const event = e as FetchEvent;

  event.respondWith(pipe(parseUrl, getURLVideoID, fromEither)(event.request.url)
    .chain(getVideoPage)
    .chain(page => pipe(isUnavailable, fromOption(page), swap, fromEither)(page))
    .chain(pipe(getVideoJson, fromEither))
    .chain(getVideoInfo)
    .map(body => {
      const info = querystring.parse(body);
      return new Response(JSON.stringify(info), { status: 200 });
    })
    .mapLeft(error => new Response(error.message, { status: 401 }))
    .run().then(e => e.value)
  );
});
