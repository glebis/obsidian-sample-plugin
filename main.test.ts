import { App, Editor, TAbstractFile, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, FileSystemAdapter } from 'obsidian';
import { v4 as uuid } from "uuid";

interface ElevenLabsTTSSettings {
    apiKey: string;
    selectedVoice: string;
    outputFolder: string;
    attachToDaily: boolean;
    dailyNotePattern: string;
}

const DEFAULT_SETTINGS: ElevenLabsTTSSettings = {
    apiKey: '',
    selectedVoice: 'Rachel',
    outputFolder: '',
    attachToDaily: false,
    dailyNotePattern: 'YYYY-MM-DD.md'
}

const BASE_URL = "https://api.elevenlabs.io/v1";

interface VoiceSettings {
    stability: number;
    similarity_boost: number;
}

interface TextToSpeechRequest {
    model_id: string;
    text: string;
    voice_settings?: VoiceSettings;
}

export default class ElevenLabsTTSPlugin extends Plugin {
    settings: ElevenLabsTTSSettings;

    async onload() {
        await this.loadSettings();

        this.addCommand({
            id: 'read-with-eleventy',
            name: 'Read with Eleventy',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                this.generateAudio(editor.getSelection());
            }
        });

        this.addSettingTab(new ElevenLabsTTSSettingTab(this.app, this));
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async generateAudio(text: string): Promise<void> {
        if (!this.settings.apiKey) {
            new Notice('API key not set. Please set your API key in the plugin settings.');
            return;
        }

        try {
            const voiceSettings: VoiceSettings = {
                stability: 0.5,
                similarity_boost: 0.5,
            };

            const data: TextToSpeechRequest = {
                model_id: "eleven_multilingual_v2",
                text: text,
                voice_settings: voiceSettings,
            };

            const requestOptions = {
                method: "POST",
                headers: {
                    Accept: "audio/mpeg",
                    "xi-api-key": this.settings.apiKey,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(data),
            };

            const response = await fetch(`${BASE_URL}/text-to-speech/${this.settings.selectedVoice}`, requestOptions);
            const audioData = await response.arrayBuffer();

            const fileName = `${uuid()}.mp3`;
            const filePath = `${this.settings.outputFolder}/${fileName}`;

            await this.app.vault.adapter.writeBinary(filePath, audioData);

            new Notice(`Audio file created: ${fileName}`);

            if (this.settings.attachToDaily) {
                await this.attachToDaily(filePath);
            }

            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const source = audioContext.createBufferSource();
            const audioBuffer = await audioContext.decodeAudioData(audioData);
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.start();
        } catch (error) {
            console.error('Error generating audio:', error);
            new Notice('Error generating audio file');
        }
    }

    async attachToDaily(filePath: string) {
        const today = new Date();
        const dailyNotePattern = this.settings.dailyNotePattern;
        const dailyNotePath = `${this.settings.outputFolder}/${this.formatDate(today, dailyNotePattern)}`;
        const dailyNote = this.app.vault.getAbstractFileByPath(dailyNotePath);

        if (dailyNote) {
            const adapter = this.app.vault.adapter;
            if (adapter instanceof FileSystemAdapter) {
                const imageLink = `\n\n![[${filePath}]]`;
                await adapter.append(dailyNotePath, imageLink);
                new Notice('Audio file attached to daily note');
            } else {
                new Notice('Unsupported adapter for appending to file');
            }
        } else {
            new Notice('No active daily note found');
        }
    }

    private formatDate(date: Date, pattern: string): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        return pattern
            .replace('YYYY', year.toString())
            .replace('MM', month)
            .replace('DD', day);
    }
}

class ElevenLabsTTSSettingTab extends PluginSettingTab {
    plugin: ElevenLabsTTSPlugin;

    constructor(app: App, plugin: ElevenLabsTTSPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    async display(): Promise<void> {
        const {containerEl} = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName('API Key')
            .setDesc('Enter your ElevenLabs API key')
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.plugin.settings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.apiKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Voice')
            .setDesc('Select the voice to use')
            .addDropdown(async (dropdown) => {
                const requestOptions = {
                    method: "GET",
                    headers: {
                        "xi-api-key": this.plugin.settings.apiKey,
                    },
                };

                const voices = await fetch(`${BASE_URL}/voices`, requestOptions);
                const voicesData = await voices.json();

                voicesData.voices.forEach((voice: any) => {
                    dropdown.addOption(voice.voice_id, voice.name);
                });
                dropdown.setValue(this.plugin.settings.selectedVoice);
                dropdown.onChange(async (value) => {
                    this.plugin.settings.selectedVoice = value;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName('Output Folder')
            .setDesc('Select the folder where audio files will be saved')
            .addText(text => text
                .setPlaceholder('Enter folder path')
                .setValue(this.plugin.settings.outputFolder)
                .onChange(async (value) => {
                    this.plugin.settings.outputFolder = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Attach to Daily Note')
            .setDesc('Automatically attach generated audio files to the daily note')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.attachToDaily)
                .onChange(async (value) => {
                    this.plugin.settings.attachToDaily = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Daily Note Pattern')
            .setDesc('Set the pattern for daily note filenames (e.g., YYYY-MM-DD.md)')
            .addText(text => text
                .setPlaceholder('YYYY-MM-DD.md')
                .setValue(this.plugin.settings.dailyNotePattern)
                .onChange(async (value) => {
                    this.plugin.settings.dailyNotePattern = value;
                    await this.plugin.saveSettings();
                }));
    }
}