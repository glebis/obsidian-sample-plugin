import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { questions } from './questions_en';

interface PermaPluginSettings {
	resultTemplate: string;
	fileNamingConvention: string;
	defaultSaveLocation: string;
	showRibbonIcon: boolean;
}

const DEFAULT_SETTINGS: Partial<PermaPluginSettings> = {
	resultTemplate: '# PERMA Profiler Results\n\nDate: {{date}}\n\n## Scores\n\nPositive Emotion: {{score_P}}\nEngagement: {{score_E}}\nRelationships: {{score_R}}\nMeaning: {{score_M}}\nAccomplishment: {{score_A}}\n\n## Interpretations\n\n{{interpretations}}',
	fileNamingConvention: 'PERMA-Results-{{date}}',
	defaultSaveLocation: '/',
	showRibbonIcon: true
};

export default class PermaPlugin extends Plugin {
	settings: PermaPluginSettings;

	async onload() {
		// Add this line at the beginning of the onload method
		(this.app as any).plugins.plugins['perma-profiler'] = this;
		await this.loadSettings();

		// Add ribbon icon
		if (this.settings.showRibbonIcon) {
			const ribbonIconEl = this.addRibbonIcon('clipboard-list', 'PERMA Profiler', (evt: MouseEvent) => {
				new PermaTestModal(this.app).open();
			});
			ribbonIconEl.addClass('perma-profiler-ribbon-class');
		}

		// Add command to start the PERMA Profiler test
		this.addCommand({
			id: 'start-perma-test',
			name: 'Start PERMA Profiler Test',
			callback: () => {
				new PermaTestModal(this.app).open();
			}
		});

		// Add settings tab
		this.addSettingTab(new PermaSettingTab(this.app, this));
	}

	onunload() {
		// Clean up resources if needed
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class PermaTestModal extends Modal {
	private currentQuestion: number = 0;
	private answers: Map<number, number> = new Map();
	private questions: string[];

	constructor(app: App) {
		super(app);
		this.questions = questions;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl('h2', {text: 'PERMA Profiler Test'});
		this.displayQuestion();
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}

	private displayQuestion() {
		const {contentEl} = this;
		contentEl.empty();

		const questionEl = contentEl.createEl('div', {cls: 'perma-question'});
		questionEl.createEl('p', {text: this.questions[this.currentQuestion]});

		new Setting(contentEl)
			.setName('Your answer')
			.setDesc('0 = Never, 10 = Always')
			.addSlider(slider => slider
				.setLimits(0, 10, 1)
				.setValue(this.answers.get(this.currentQuestion) || 5)
				.setDynamicTooltip()
				.onChange(value => {
					this.answers.set(this.currentQuestion, value);
				}));

		const navigationEl = contentEl.createEl('div', {cls: 'perma-navigation'});
		
		if (this.currentQuestion > 0) {
			navigationEl.createEl('button', {text: 'Previous'}).onclick = () => this.previousQuestion();
		}
		
		if (this.currentQuestion < this.questions.length - 1) {
			navigationEl.createEl('button', {text: 'Next'}).onclick = () => this.nextQuestion();
		} else {
			navigationEl.createEl('button', {text: 'Finish'}).onclick = () => this.finishTest();
		}

		contentEl.createEl('div', {cls: 'perma-progress', text: `Question ${this.currentQuestion + 1} of ${this.questions.length}`});
	}

	private nextQuestion() {
		if (this.currentQuestion < this.questions.length - 1) {
			this.currentQuestion++;
			this.displayQuestion();
		}
	}

	private previousQuestion() {
		if (this.currentQuestion > 0) {
			this.currentQuestion--;
			this.displayQuestion();
		}
	}

	private async finishTest() {
		// Calculate scores
		const scores = this.calculateScores();
		
		// Generate result content
		const content = this.generateResultContent(scores);
		
		// Create and open the new note
		const fileName = this.generateFileName();
		const file = await this.createResultNote(fileName, content);
		
		// Open the newly created note
		if (file instanceof TFile) {
			this.app.workspace.getLeaf().openFile(file);
		}
		
		new Notice('Test completed! Results have been generated and opened.');
		this.close();
	}

	private calculateScores() {
		// TODO: Implement actual scoring logic
		return {
			P: 5, E: 5, R: 5, M: 5, A: 5
		};
	}

	private generateResultContent(scores: Record<string, number>) {
		const plugin = this.app.plugins.getPlugin('perma-profiler') as PermaPlugin;
		let content = plugin.settings.resultTemplate;
		
		const date = new Date().toISOString().split('T')[0];
		content = content.replace('{{date}}', date);
		
		for (const [key, value] of Object.entries(scores)) {
			content = content.replace(`{{score_${key}}}`, value.toString());
		}
		
		// TODO: Generate interpretations
		content = content.replace('{{interpretations}}', 'Interpretations to be implemented.');
		
		return content;
	}

	private generateFileName() {
		const plugin = this.app.plugins.getPlugin('perma-profiler') as PermaPlugin;
		const date = new Date().toISOString().split('T')[0];
		return plugin.settings.fileNamingConvention.replace('{{date}}', date) + '.md';
	}

	private async createResultNote(fileName: string, content: string) {
		const plugin = this.app.plugins.getPlugin('perma-profiler') as PermaPlugin;
		const path = `${plugin.settings.defaultSaveLocation}/${fileName}`;
		const file = await this.app.vault.create(path, content);
		return file;
	}
}

class PermaSettingTab extends PluginSettingTab {
	plugin: PermaPlugin;

	constructor(app: App, plugin: PermaPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'PERMA Profiler Settings'});

		new Setting(containerEl)
			.setName('Result Template')
			.setDesc('Template for generating result notes')
			.addTextArea(text => text
				.setPlaceholder('Enter your template')
				.setValue(this.plugin.settings.resultTemplate)
				.onChange(async (value) => {
					this.plugin.settings.resultTemplate = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('File Naming Convention')
			.setDesc('Convention for naming result files')
			.addText(text => text
				.setPlaceholder('Enter file naming convention')
				.setValue(this.plugin.settings.fileNamingConvention)
				.onChange(async (value) => {
					this.plugin.settings.fileNamingConvention = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Default Save Location')
			.setDesc('Default location to save result notes')
			.addText(text => text
				.setPlaceholder('Enter default save location')
				.setValue(this.plugin.settings.defaultSaveLocation)
				.onChange(async (value) => {
					this.plugin.settings.defaultSaveLocation = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Show Ribbon Icon')
			.setDesc('Toggle visibility of the ribbon icon')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showRibbonIcon)
				.onChange(async (value) => {
					this.plugin.settings.showRibbonIcon = value;
					await this.plugin.saveSettings();
				}));
	}
}
