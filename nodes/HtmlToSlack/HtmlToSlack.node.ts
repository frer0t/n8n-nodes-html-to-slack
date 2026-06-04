import type {
	IDataObject,
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
				displayName: 'HTML',
				name: 'html',
				type: 'string',
				typeOptions: { rows: 5 },
				default: '',
				description: 'HTML to convert. Type plain HTML, reference the attached node with ={{ $JSON.body }}, or reference any earlier node with ={{ $(\'NodeName\').item.JSON.body }}.',
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
		const incoming = this.getInputData();

		// If the directly attached node produced no items, run once with empty JSON
		// so expressions referencing earlier nodes (e.g. {{ $('If').item.json.html }})
		// are still evaluated.
		const items: INodeExecutionData[] =
			incoming.length > 0 ? incoming : [{ json: {} as IDataObject, pairedItem: { item: 0 } }];

		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const html = this.getNodeParameter('html', i, '') as string;
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
