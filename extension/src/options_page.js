/* @flow */
import {unwrap} from './common';
import {getOptions, setOptions} from './options'
import {defensifyAlert, alertError} from './notifications';

// helpers for options
class Option<T> {
    id: string

    constructor(id: string) {
        this.id = id
    }

    set value(x: T): void {
        throw Error('Not implemented')
    }
    get value(): T {
        throw Error('Not implemented')
    }

    get element(): HTMLInputElement {
        return ((document.getElementById(this.id): any): HTMLInputElement);
    }
}

class Simple extends Option<string> {
    set value(x: string): void {
        this.element.value = x
    }

    get value(): string {
        return this.element.value
    }
}

class Toggle extends Option<boolean> {
    set value(x: boolean): void {
        this.element.checked = x
    }

    get value(): boolean {
        return this.element.checked
    }
}


var editors = {}
class Editor extends Option<string> {
    mode: ?string
    constructor(id: string, {mode}) {
        super(id)
        this.mode = mode
    }

    set value(x: string): void {
        this.editor.updateCode(x)
    }

    get value(): string {
        return this.editor.toString()
    }

    bind({Jar}): void {
        const cls = 'language-' + (this.mode == null ? 'plaintext' : this.mode)
        editors[this.id] = Jar(this.element)
    }

    get editor() {
        // $FlowFixMe
        return unwrap(editors[this.id])
    }
}
// end

const o_host           = new Simple('host_id'               )
const o_token          = new Simple('token_id'              )
const o_verbose_errors = new Toggle('verbose_errors_id'     )
const o_contexts_popup = new Toggle('contexts_popup_id'     )
const o_detect_urls    = new Toggle('detect_sidebar_urls_id')
const o_highlights_on  = new Toggle('highlight_id'          )
// TODO ('dots_id');

const o_blacklist    = new Editor('blacklist_id'   , {mode: null  })
const o_filterlists  = new Editor('filterlists_id' , {mode: 'json'})
const o_src_map      = new Editor('source_map_id'  , {mode: 'json'})
const o_position_css = new Editor('position_css_id', {mode: 'css' })
const o_extra_css    = new Editor('extra_css_id'   , {mode: 'css' })


async function importJar() {
    const {CodeJar}         = await import('codejar/codejar.js')
    const {withLineNumbers} = await import('codejar/linenumbers.js')

    const {default: hljs  } = await import('highlight.js/lib/core.js')
    for (const lname of ['json', 'css', 'plaintext']) {
        const Lang = await import('highlight.js/lib/languages/' + lname + '.js')
        hljs.registerLanguage(lname, Lang.default)
    }
    await import('highlight.js/styles/default.css')

    // err. that's a bit stupid, js injected css? surely it can be done via webpack and static files...
    const highlight = editor => {
        // hack to trim old tags (highlight.js bug)
        editor.textContent = editor.textContent
        hljs.highlightBlock(editor)
    }
    // todo useBr??
    const jar_factory = (el: HTMLElement) => new CodeJar(el, withLineNumbers(highlight))
    return jar_factory
}

document.addEventListener('DOMContentLoaded', defensifyAlert(async () => {
    const opts = await getOptions()
    o_host          .value = opts.host
    o_token         .value = opts.token
    o_verbose_errors.value = opts.verbose_errors_on
    o_contexts_popup.value = opts.contexts_popup_on
    o_detect_urls   .value = opts.detect_sidebar_urls
    o_highlights_on .value = opts.highlight_on
    // todo getDots().checked    = opts.dots;

    const Jar = await importJar()

    // TODO it should know the syntax? or infer from the class??
    for (const [el, value] of [
        [o_blacklist   , opts.blacklist   ],
        [o_filterlists , opts.filterlists ],
        [o_src_map     , opts.src_map     ],
        [o_position_css, opts.position_css],
        [o_extra_css   , opts.extra_css   ],
    ]) {
        el.bind({Jar: Jar})
        el.value = value
    }
}));

// TODO careful here if I ever implement not showing notifications?
// defensify might need to alert then...
unwrap(document.getElementById('save_id')).addEventListener('click', defensifyAlert(async () => {
    // todo make opts active object so we don't query unnecessary things like blacklist every time?
    const opts = {
        host               : o_host          .value,
        token              : o_token         .value,
        verbose_errors_on  : o_verbose_errors.value,
        contexts_popup_on  : o_contexts_popup.value,
        detect_sidebar_urls: o_detect_urls   .value,
        highlight_on       : o_highlights_on .value,
        dots          : true, // todo? getDots().checked,
        blacklist          : o_blacklist     .value,
        filterlists        : o_filterlists   .value,
        src_map            : o_src_map       .value,
        position_css       : o_position_css  .value,
        extra_css          : o_extra_css     .value,
    };
    await setOptions(opts);
    alert("Saved!");
}));


// https://stackoverflow.com/questions/46946380/fetch-api-request-timeout
// not fully correct, need to cancel request; but hopefully ok for now
function fetchTimeout(url, options, timeout) {
    return new Promise((resolve, reject) => {
        fetch(url, options).then(resolve, reject);

        if (timeout) {
            const e = new Error("Connection timed out");
            setTimeout(reject, timeout, e);
        }
    });
}

unwrap(document.getElementById('backend_status_id')).addEventListener('click', defensifyAlert(async() => {
    const host  = o_host .value
    const token = o_token.value

    const second = 1000;
    await fetchTimeout(`${host}/status`, {
        method: 'POST',
        headers: {
            'Authorization': "Basic " + btoa(token),
        },
    }, second).then(res => {
        if (!res.ok) {
            throw new Error(`Backend error: ${res.status} ${res.statusText}`)
        }
        return res;
    }).then(async res => {
        // TODO ugh. need to reject if ok is false...
        const resj = await res.json()
        alert(`Success! ${JSON.stringify(resj)}`)
    }, err => {
        alertError(`${err}. See https://github.com/karlicoss/promnesia/blob/master/doc/TROUBLESHOOTING.org`);
    });
}));
