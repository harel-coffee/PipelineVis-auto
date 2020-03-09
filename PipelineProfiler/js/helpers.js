import { median } from 'd3-array';
import {startCase} from "lodash";

export function createGettersSetters(container, parameterDict){
  let keys = Object.keys(parameterDict);
  for (let kid in keys){
    let key = keys[kid];
    container[key] = function(value){
      if (!arguments.length)
        return parameterDict[key];
      parameterDict[key] = value;
      return container;
    }
  }
}

export function extractHyperparams(infos, pipelines){
  const uniqueHyperparams = {};
  const hyperparams = {};
  /* ==============================================
     Hyperparams shape
     ==============================================
       hyperparams = {
        [module_name]: [
          { // pipeline_i
             [hyperparam_1]: [value_1],
             [hyperparam_2]: [value_2],
             ...
             [hyperparam_n]: [value_n],
          }
          ...
        ],
        [module_name]: [
          {

          }
        ]
       }

   */
  const moduleNames = Object.keys(infos);

  moduleNames.forEach(moduleName => {
    hyperparams[moduleName] = [];
  });

  pipelines.forEach((pipeline) => {
    pipeline.steps.forEach(step => {
      if ('hyperparams' in step) {
        const moduleName = step.primitive.python_path;
        const moduleParams = {};
        Object.keys(step['hyperparams']).forEach(paramName => {
          const hValue = JSON.stringify(step['hyperparams'][paramName]['data']);

          if (! (moduleName in uniqueHyperparams)) {
            uniqueHyperparams[moduleName] = {};
          }
          if (! (paramName in uniqueHyperparams[moduleName])) uniqueHyperparams[moduleName][paramName] = {};

          uniqueHyperparams[moduleName][paramName][hValue] = true;
          moduleParams[paramName] = hValue;

        });
        hyperparams[moduleName].push(moduleParams);
      }
    });
  });

  // Since not all hyperparams are used by all modules, normalizing hyperparam table
  moduleNames.forEach(moduleName => {
    hyperparams[moduleName].forEach(pipeline => {
      Object.keys(uniqueHyperparams[moduleName]).forEach(paramName => {
        if (!(paramName in pipeline)){
          pipeline[paramName] = 'default';
        }
      });
    });
  });
  return hyperparams;
}

function extractPrimitiveNames(pipeline){
  return pipeline['steps'].map(step => step['primitive']['python_path'])
}

function computePipelinePrimitiveHashTable(pipelines) {
  const pipelinePrimitiveLookup = [];
  for (const pipeline of pipelines) {
    const hash = {};
    for (const primitive of extractPrimitiveNames(pipeline)){
      hash[primitive] = true;
    }
    pipelinePrimitiveLookup.push(hash)
  }
  return pipelinePrimitiveLookup;
}



export function extractMetric (pipelines, scoreRequest) { // scoreRequest: {type: constants.scoreRequest, name: str}
  if (scoreRequest['type'] === constants.scoreRequest.TIME){
    return pipelines.map(p => (new Date(p['end']) - new Date(p['start'])) / 1000);
  } else if (scoreRequest['type'] === constants.scoreRequest.D3MSCORE) {
    let idxScore = -1;
    pipelines[0]['scores'].forEach((score, idx) => {
      if (score['metric']['metric'] === scoreRequest.name) {
        idxScore = idx;
      }
    });
    if (idxScore === -1) {
      return null;
    }
    return pipelines.map(p => p['scores'][idxScore]['value']);
  }
}

function computePrimitiveImportance(pipelinePrimitiveLookup, scores, primitive) {
  let arrayUsing = [];
  let arrayNotUsing = [];
  pipelinePrimitiveLookup.forEach((hash, idx) => {
    if (primitive in hash) {
      arrayUsing.push(scores[idx]);
    } else {
      arrayNotUsing.push(scores[idx]);
    }
  });
  if (arrayUsing.length === scores.length || arrayNotUsing.length === scores.length) {
    return 0;
  }
  return median(arrayUsing) - median(arrayNotUsing);
}

export function getPrimitiveLabel(name) {
  const nameParts = name.split('.');
  if (name.split('.').length > 2) {
    name = nameParts.pop();
  }
  // name =name.split(' ').slice(0,3).join(' ');
  return startCase(name);
}

export function computePrimitiveImportances(infos, pipelines, scoreRequest) {
  const primitiveNames = Object.keys(infos);
  const scores = extractMetric(pipelines, scoreRequest);

  const hashTable = computePipelinePrimitiveHashTable(pipelines);
  const primitiveImportances = {};
  primitiveNames.forEach(name => {
    primitiveImportances[name] = computePrimitiveImportance(hashTable, scores, name);
  });
  return primitiveImportances;
}

export function extractMetricNames(pipelines) {
  return pipelines[0]['scores'].map(score => score['metric']['metric']);
}

export function computePrimitiveMetadata2(pipelines) {
  let metadata = [];
  pipelines.forEach(pipeline => {
    pipeline.steps.forEach(step => {
      const python_path = step.primitive.python_path;
      if ('hyperparams' in step){
        Object.keys(step.hyperparams).forEach(hyperparamKey => {
          const value  = JSON.stringify(step.hyperparams[hyperparamKey].data);
          const row = {
            pipeline: pipeline.pipeline_digest,
            hyperparam: hyperparamKey,
            value,
            python_path,
          };
          metadata.push(row)
        });
      }
    });
  });
  return metadata;
}


export function computePrimitiveMetadata(pipelines) {
  // Computes primitive metadata for hyperparameter table
  let metadata = {};
  pipelines.forEach(pipeline => {
    pipeline.steps.forEach(step => {
      const python_path = step.primitive.python_path;
      if (!(python_path in metadata)) {
        metadata[python_path] = {
          hyperparams: {},
          pipelines: [],
        }
      }
      metadata[python_path].pipelines.push(pipeline);
      if ('hyperparams' in step){
        Object.keys(step.hyperparams).forEach(hyperparamKey => {
          const hyperparams = metadata[python_path].hyperparams;
          if (!(hyperparamKey in hyperparams)) {
            hyperparams[hyperparamKey] = {
              values: {},
              pipelines: []
            }
          }
          hyperparams[hyperparamKey].pipelines.push(pipeline);

          const value  =step.hyperparams[hyperparamKey].data;
          if (!(value in hyperparams[hyperparamKey].values)) {
            hyperparams[hyperparamKey].values[value] = {
              pipelines: []
            }
          }
          hyperparams[hyperparamKey].values[value].pipelines.push(pipeline)
        });
      }
    });
  });
  return metadata;
}

export function createHyperparamTableDataFromNode(node){
  const tableData = [];
  if ('hyperparams' in node) {
    for (const hyperparamName of Object.keys(node.hyperparams)) {
      let row = {};
      row['name'] = hyperparamName;
      row['value'] = node.hyperparams[hyperparamName].data;
      tableData.push(row);
    }
  }
  if (tableData.length === 0) {
    return null;
  }
  return tableData;
}

export const constants = {
  moduleTypeOrder: ["Preprocessing", "Feature Extraction", "Operator", "Regression", "Classification"],
  scoreRequest: {
    TIME: 'TIME',
    D3MSCORE: 'D3MSCORE'
  },
  sortModuleBy: {
    importance: 'MODULE_IMPORTANCE',
    moduleType: 'MODULE_TYPE'
  },
  sortPipelineBy: {
    pipeline_source: 'PIPELINE_SOURCE',
    pipeline_score: 'PIPELINE_SCORE',
  },
  pipelineNameWidth: 100,
  moduleImportanceHeight: 100,
  moduleNameHeight: 150,
  hyperparamsHeight: 100,
  cellWidth: 15,
  cellHeight: 15,
  pipelineScoreWidth: 200,
  margin: {
    left: 10,
    right: 10,
    top: 10,
    bottom: 10,
  }
};