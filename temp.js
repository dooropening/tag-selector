const { Plugin, TFile, TFolder, Modal, Notice, PluginSettingTab, Setting, Vault } = require('obsidian');

class TagSelectorPlugin extends Plugin {
  async onload() {
    console.log('加载 TagSelectorPlugin');

    // 加载设置
    await this.loadSettings();

    console.log('设置已加载');

    // 加载标签文件
    await this.loadTagFiles();

    console.log('标签文件已加载');

    // 添加自定义样式
    this.addCustomStyles();

    console.log('自定义样式已添加');

    // 添加设置选项卡
    this.addSettingTab(new TagSelectorSettingTab(this.app, this));

    console.log('设置选项卡已添加');

    // 添加命令
    this.addCommand({
      id: 'select-tag',
      name: '从标签系统选择标签',
      callback: () => this.selectTag(),
    });

    console.log('命令已添加');
  }

  async loadSettings() {
    console.log('正在加载设置...');
    this.settings = await this.loadData(); // 直接使用 loadData 的结果作为 settings
    console.log('加载数据:', this.settings);
  }

  async saveSettings() {
    await this.saveData(this.settings);
    new Notice('设置保存成功！');
  }

  async loadTagFiles() {
    if (!this.settings.tagDirectoryPath) {
      new Notice('标签目录未设置。请在插件设置中设置标签目录。');
      return;
    }

    const tagDirectoryPath = decodeURIComponent(this.settings.tagDirectoryPath);
    console.log('从目录加载标签文件:', tagDirectoryPath);

    try {
      const files = await this.getTagFiles(tagDirectoryPath);
      console.log('找到的标签文件:', files);

      this.allTags = [];

      for (const filePath of files) {
        const tags = await this.getTags(filePath);
        console.log('来自文件', filePath, '的标签:', tags);

        this.allTags.push(...tags);
      }

      console.log('所有标签:', this.allTags);
    } catch (error) {
      console.error('加载标签文件时出错:', error);
    }
  }

  // ... 其他方法保持不变 ...

}

class TagSelectionModal extends Modal {
  // ... 类定义保持不变 ...
}

class TagSelectorSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;

    containerEl.empty();

    containerEl.createEl('h2', { text: '标签选择器插件设置' });

    new Setting(containerEl)
      .setName('标签目录路径')
      .setDesc('包含标签 Markdown 文件的目录路径。')
      .addText(text => {
        text
          .setPlaceholder('输入标签目录的路径')
          .setValue(this.plugin.settings.tagDirectoryPath || '')
          .onChange(value => {
            this.plugin.settings.tagDirectoryPath = value;
            console.log('更新后的 tagDirectoryPath:', this.plugin.settings.tagDirectoryPath);
          });
        text.inputEl.classList.add('fixed-size-input');
      });

    new Setting(containerEl)
      .addButton(button => {
        button
          .setButtonText('保存')
          .setCta()
          .onClick(async () => {
            await this.plugin.saveSettings();
            console.log('通过按钮保存的设置:', this.plugin.settings);
          });
      });
  }
}

module.exports = TagSelectorPlugin;