import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { htmlToMrkdwn } from './htmlToMrkdwn';
import type { ConversionOptions } from './htmlToMrkdwn';

export class HtmlToSlack implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'HTML to Slack',
		name: 'htmlToSlack',
		icon: 'file:htmlToSlack.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["outputField"]}}',
		description: 'Converts HTML to Slack mrkdwn formatted text',
		defaults: { name: 'HTML to Slack' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		properties: [
			{
				displayName: 'HTML Source',
				name: 'htmlSource',
				type: 'options',
				options: [
					{
						name: 'Fixed Value',
						value: 'expression',
						description: 'Type HTML directly or use an expression like ={{ $JSON.body }}',
					},
					{
						name: 'From Input Field',
						value: 'field',
						description: 'Read HTML from a named field in the input item (Gmail, HTTP Request, etc.)',
					},
				],
				default: 'field',
				noDataExpression: true,
			},
			{
				displayName: 'HTML Field Name',
				name: 'htmlFieldName',
				type: 'string',
				default: 'html',
				required: true,
				displayOptions: { show: { htmlSource: ['field'] } },
				hint: 'Name of the field from the previous node that contains HTML. Gmail uses "body", HTTP Request uses "data".',
				description: 'Field in the input item that contains the HTML to convert',
			},
			{
				displayName: 'HTML',
				name: 'html',
				type: 'string',
				typeOptions: { rows: 5 },
				default: '',
				required: true,
				displayOptions: { show: { htmlSource: ['expression'] } },
				description: 'HTML string to convert. Supports expressions like ={{ $JSON.body }}.',
			},
			{
				displayName: 'Output Field Name',
				name: 'outputField',
				type: 'string',
				default: 'text',
				description: 'Name of the output field that will hold the mrkdwn string',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Heading Style',
						name: 'headingStyle',
						type: 'options',
						options: [
							{ name: 'Bold', value: 'bold' },
							{ name: 'Bold With Separator', value: 'boldWithSeparator' },
							{ name: 'Strip Headings', value: 'strip' },
						],
						default: 'bold',
						description: 'How to handle &lt;h1&gt;–&lt;h6&gt; tags. Slack has no heading syntax.',
					},
					{
						displayName: 'Table Handling',
						name: 'tableHandling',
						type: 'options',
						options: [
							{ name: 'Plain Text (Flatten Cells, Tab-Separated)', value: 'plainText' },
							{ name: 'Strip Tables Entirely', value: 'strip' },
						],
						default: 'plainText',
						description: 'How to handle &lt;table&gt; elements. Slack does not render tables.',
					},
					{
						displayName: 'Image Handling',
						name: 'imageHandling',
						type: 'options',
						options: [
							{ name: 'Use Alt Text', value: 'altText' },
							{ name: 'Use Src URL as Slack Link', value: 'asLink' },
							{ name: 'Strip Images Entirely', value: 'strip' },
						],
						default: 'altText',
						description: 'How to handle &lt;img&gt; tags. Slack does not render inline images.',
					},
					{
						displayName: 'Trim Whitespace',
						name: 'trimWhitespace',
						type: 'boolean',
						default: true,
						description: 'Whether to collapse 3+ consecutive newlines to a single blank line',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const htmlSource = this.getNodeParameter('htmlSource', i, 'field') as string;
				let html: string;

				if (htmlSource === 'field') {
					const fieldName = this.getNodeParameter('htmlFieldName', i, 'html') as string;
					const value = items[i].json[fieldName];
					html = typeof value === 'string' ? value : String(value ?? '');
				} else {
					html = this.getNodeParameter('html', i, '') as string;
				}

				const outputField = this.getNodeParameter('outputField', i, 'text') as string;
				const options = this.getNodeParameter('options', i, {}) as ConversionOptions;

				const mrkdwn = htmlToMrkdwn(html, options);

				returnData.push({
					json: {
						...items[i].json,
						[outputField]: mrkdwn,
					},
					pairedItem: { item: i },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { ...items[i].json, error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
