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
      console.log('找到的标签文件:', files); // 新增的调试语句

      this.allTags = [];

      for (const filePath of files) {
        const tags = await this.getTags(filePath);
        console.log('来自文件', filePath, '的标签:', tags); // 新增的调试语句

        this.allTags.push(...tags);
      }

      console.log('所有标签:', this.allTags);
    } catch (error) {
      console.error('加载标签文件时出错:', error);
    }
  }

  async getTagFiles(tagDirectoryPath) {
    const files = [];
    const folder = this.app.vault.getAbstractFileByPath(tagDirectoryPath);

    if (folder) {
      console.log('Abstract file found:', folder);
      if (folder instanceof TFolder) {
        console.log('Directory found:', folder);
        Vault.recurseChildren(folder, (file) => {
          if (file instanceof TFile && file.extension === 'md') {
            files.push(file.path);
          }
        });
      } else {
        console.error('The path is not a directory:', tagDirectoryPath);
      }
    } else {
      console.error('Directory not found or is not a folder:', tagDirectoryPath);
    }

    console.log('Files found in directory:', files);
    return files;
  }

  onunload() {
    console.log('Unloading TagSelectorPlugin');
  }

  addCustomStyles() {
    const css = `
    .tag-node {
      cursor: pointer;
    }

    .tag-node:hover {
      background-color: #f0f0f0;
      color: #000;
    }

    .fixed-size-input {
      width: 100%;
      height: 30px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    `;

    const styleElement = document.createElement('style');
    styleElement.textContent = css;
    document.head.appendChild(styleElement);
  }

  async selectTag() {
    if (!this.allTags || this.allTags.length === 0) {
      new Notice('No tags found. Please make sure the tag directory is properly set and contains valid tag files.');
      return;
    }

    const { tagPath, fullPath } = await this.showTagSelectionDialog(this.allTags);
    if (tagPath) {
      this.insertTagIntoActiveFile(tagPath, fullPath);
    }
  }

  async getTags(tagFilePath) {
    const decodedPath = decodeURIComponent(tagFilePath);
    const file = this.app.vault.getAbstractFileByPath(decodedPath);
    if (!(file && file instanceof TFile)) {
      new Notice('Tag file not found in the vault.');
      return [];
    }
    const content = await this.app.vault.read(file);
    return this.parseTagsFromContent(content);
  }

  parseTagsFromContent(content) {
    const lines = content.split('\n');
    const tags = [];
    const stack = [];

    lines.forEach(line => {
      const match = line.match(/^#+\s*(.+)/);
      if (match) {
        const tagName = match[1].trim();
        const level = match[0].length;

        const tagNode = { tag: tagName, children: [] };

        while (stack.length >= level) {
          stack.pop();
        }

        if (stack.length === 0) {
          tags.push(tagNode);
        } else {
          const parent = stack[stack.length - 1];
          parent.children.push(tagNode);
        }

        stack.push(tagNode);
      }
    });

    return tags;
  }

  async showTagSelectionDialog(tags) {
    return new Promise((resolve) => {
      const modal = new TagSelectionModal(this.app, tags, resolve);
      modal.open();
    });
  }

  async insertTagIntoActiveFile(tagPath, fullPath) {
    const activeLeaf = this.app.workspace.activeLeaf;
    if (!activeLeaf) return;
    const editor = activeLeaf.view.sourceMode.cmEditor;
    if (!editor) return;
    const tagToInsert = fullPath ? `#${tagPath}` : `#${tagPath.split('/').pop()}`;
    editor.replaceSelection(tagToInsert);
  }

  async loadSettings() {
    console.log('Loading settings...');
    const loadedData = await this.loadData();
    console.log('Loaded data:', loadedData);

    this.settings = Object.assign({}, loadedData, { tagDirectoryPath: '' });
    console.log('Merged settings:', this.settings);
  }

  async saveSettings() {
    await this.saveData(this.settings);
    new Notice('Settings saved successfully!');
  }
}

class TagSelectionModal extends Modal {
  constructor(app, tags, onSelect) {
    super(app);
    this.tags = tags;
    this.onSelect = onSelect;
    this.fullPath = true;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Select a Tag' });

    this.renderTags(contentEl, this.tags);
  }

  renderTags(container, tags) {
    const ul = container.createEl('ul');
    tags.forEach(tagNode => {
      const li = ul.createEl('li');
      const span = li.createEl('span', { text: tagNode.tag, cls: 'tag-node' });
      span.onclick = () => {
        this.onSelect({ tagPath: tagNode.tag, fullPath: this.fullPath });
        this.close();
      };
      if (tagNode.children.length > 0) {
        this.renderTags(li, tagNode.children);
      }
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
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
