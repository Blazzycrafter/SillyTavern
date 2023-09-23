import { saveTtsProviderSettings } from "./index.js"
export { TortoiseTtsProvider }

class TortoiseTtsProvider {
    //########//
    // Config //
    //########//

    settings
    voices = []
    separator = ' ... ... ... '

    get settings() {
        return this.settings
    }

    defaultSettings = {
        stability: 0.75,
        similarity_boost: 0.75,
        apiKey: "",
        multilingual: false,
        voiceMap: {},
        apiUrl: "localhost:6666"
    }

    get settingsHtml() {
        let html = `
        <div class="tortoise_tts_settings">
            <label for="tortoise_tts_api_key">API Key</label>
            <input id="tortoise_tts_api_key" type="text" class="text_pole" placeholder="<API Key>"/>
            <input id="tortoise_connect" class="menu_button" type="button" value="Connect" />
            <label for="tortoise_tts_stability">Stability: <span id="tortoise_tts_stability_output"></span></label>
            <input id="tortoise_tts_stability" type="range" value="${this.defaultSettings.stability}" min="0" max="1" step="0.05" />
            <label for="tortoise_tts_similarity_boost">Similarity Boost: <span id="tortoise_tts_similarity_boost_output"></span></label>
            <input id="tortoise_tts_similarity_boost" type="range" value="${this.defaultSettings.similarity_boost}" min="0" max="1" step="0.05" />
            <label class="checkbox_label" for="tortoise_tts_multilingual">
                <input id="tortoise_tts_multilingual" type="checkbox" value="${this.defaultSettings.multilingual}" />
                Enable Multilingual
            </label>
            <label for="tortoise_tts_api_url">API URL</label>
            <input id="tortoise_tts_api_url" type="text" class="text_pole" placeholder="<API URL>"/>
        </div>
        `
        return html
    }

    onSettingsChange() {
        // Dynamically update settings
        this.settings.stability = $('#tortoise_tts_stability').val()
        this.settings.similarity_boost = $('#tortoise_tts_similarity_boost').val()
        this.settings.multilingual = $('#tortoise_tts_multilingual').prop('checked')
        saveTtsProviderSettings()
    }


    async loadSettings(settings) {
        // Pupulate Provider UI given input settings
        if (Object.keys(settings).length == 0) {
            console.info("Using default TTS Provider settings")
        }

        // Only accept keys defined in defaultSettings
        this.settings = this.defaultSettings

        for (const key in settings){
            if (key in this.settings){
                this.settings[key] = settings[key]
            } else {
                throw `Invalid setting passed to TTS Provider: ${key}`
            }
        }
        $('#tortoise_tts_stability').val(this.settings.stability)
        $('#tortoise_tts_similarity_boost').val(this.settings.similarity_boost)
        $('#tortoise_tts_api_key').val(this.settings.apiKey)
        $('#tortoise_tts_multilingual').prop('checked', this.settings.multilingual)
        $('#tortoise_connect').on('click', () => {this.onConnectClick()})
        $('.tortoise_tts_settings').on('input',this.onSettingsChange)
        $('#tortoise_tts_api_url').val("<API URL>")

        await this.checkReady()
        console.debug("ElevenLabs: Settings loaded")
    }

    // Perform a simple readiness check by trying to fetch voiceIds
    async checkReady(){
        await this.fetchTtsVoiceObjects()
    }

    async onRefreshClick() {
    }

    async onConnectClick() {
        // Update on Apply click
        try {
            await this.updateApiKey();
        } catch (error) {
            toastr.error(`ElevenLabs: ${error}`);
        }
    }


    async updateApiKey() {
        // Using this call to validate API key
        this.settings.apiKey = $('#tortoise_tts_api_key').val()

        await this.fetchTtsVoiceObjects().catch(error => {
            throw `TTS API key validation failed`
        })
        this.settings.apiKey = this.settings.apiKey
        console.debug(`Saved new API_KEY: ${this.settings.apiKey}`)
        this.onSettingsChange()
    }

    //#################//
    //  TTS Interfaces //
    //#################//

    async getVoice(voiceName) {
        if (this.voices.length == 0) {
            this.voices = await this.fetchTtsVoiceObjects()
        }
        const match = this.voices.filter(
            elevenVoice => elevenVoice.name == voiceName
        )[0]
        if (!match) {
            throw `TTS Voice name ${voiceName} not found in ElevenLabs account`
        }
        return match
    }


    async generateTts(text, voiceId){
        const historyId = await this.findTtsGenerationInHistory(text, voiceId)

        let response
        if (historyId) {
            console.debug(`Found existing TTS generation with id ${historyId}`)
            response = await this.fetchTtsFromHistory(historyId)
        } else {
            console.debug(`No existing TTS generation found, requesting new generation`)
            response = await this.fetchTtsGeneration(text, voiceId)
        }
        return response
    }

    //###################//
    //  Helper Functions //
    //###################//

    async findTtsGenerationInHistory(message, voiceId) {
        const ttsHistory = await this.fetchTtsHistory()
        for (const history of ttsHistory) {
            const text = history.text
            const itemId = history.history_item_id
            if (message === text && history.voice_id == voiceId) {
                console.info(`Existing TTS history item ${itemId} found: ${text} `)
                return itemId
            }
        }
        return ''
    }


    //###########//
    // API CALLS //
    //###########//
    async fetchTtsVoiceObjects() {
        const headers = {
            'xi-api-key': this.settings.apiKey
        }
        const response = await fetch(`${this.settings.apiUrl}/v1/voices`, {
            headers: headers
        })
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`)
        }
        const responseJson = await response.json()
        return responseJson.voices
    }

    async fetchTtsVoiceSettings() {
        const headers = {
            'xi-api-key': this.settings.apiKey
        }
        const response = await fetch(
            `${this.settings.apiUrl}/v1/voices/settings/default`,
            {
                headers: headers
            }
        )
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`)
        }
        return response.json()
    }

    async fetchTtsGeneration(text, voiceId) {
        let model = "eleven_monolingual_v1"
        if (this.settings.multilingual == true) {
            model = "eleven_multilingual_v1"
        }
        console.info(`Generating new TTS for voice_id ${voiceId}`)
        const response = await fetch(
            `${this.settings.apiUrl}/v1/text-to-speech/${voiceId}`,
            {
                method: 'POST',
                headers: {
                    'xi-api-key': this.settings.apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    text: text,
                    voice_settings: this.settings
                })
            }
        )
        if (!response.ok) {
            toastr.error(response.statusText, 'TTS Generation Failed');
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        return response
    }

    async fetchTtsFromHistory(history_item_id) {
        console.info(`Fetched existing TTS with history_item_id ${history_item_id}`)
        const response = await fetch(
            `${this.settings.apiUrl}/v1/history/${history_item_id}/audio`,
            {
                headers: {
                    'xi-api-key': this.settings.apiKey
                }
            }
        )
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`)
        }
        return response
    }

    async fetchTtsHistory() {
        const headers = {
            'xi-api-key': this.settings.apiKey
        }
        const response = await fetch(`${this.settings.apiUrl}/v1/history`, {
            headers: headers
        })
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`)
        }
        const responseJson = await response.json()
        return responseJson.history
    }
}
