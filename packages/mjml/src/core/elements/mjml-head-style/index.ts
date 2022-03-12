import { HeadComponent } from '../../mjml-core';

export default class MjStyle extends HeadComponent {
  static componentName = 'mj-style';

  static endingTag = true;

  static allowedAttributes = {
    inline: 'string',
  };

  override context: any;

  override getAttribute: any;

  override getContent: any;

  handler() {
    const { add } = this.context;

    add(
      this.getAttribute('inline') === 'inline' ? 'inlineStyle' : 'style',
      this.getContent()
    );
  }
}
