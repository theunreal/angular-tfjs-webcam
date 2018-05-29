import { Injectable } from '@angular/core';
import * as tf from '@tensorflow/tfjs';
import 'rxjs/add/observable/of';

@Injectable()
export class ModelService {

  model;
  isPredicting = false;
  prediction;
  labels = [];
  loading = false;

  constructor() { }

  // The number of classes we want to predict. In this example, we will be
  // predicting 4 classes for up, down, left, and right.
  get NUM_CLASSES() {
    return this.labels.length;
  }

  // Loads mobilenet and returns a model that returns the internal activation
  // we'll use as input to our classifier this.model.
  async loadMobilenet() {
    const mobilenet = await tf.loadModel(
      'https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json');

    // Return a model that outputs an internal activation.
    const layer = mobilenet.getLayer('conv_pw_13_relu');
    return tf.model({inputs: mobilenet.inputs, outputs: layer.output});
  }

  nextFrame() {
    return tf.nextFrame();
  }

  modelInit(units = 100) {
    // Creates a 2-layer fully connected this.model. By creating a separate model,
    // rather than adding layers to the mobilenet model, we "freeze" the weights
    // of the mobilenet model, and only train weights from the new this.model.
    this.model = tf.sequential({
      layers: [
        // Flattens the input to a vector so we can use it in a dense layer. While
        // technically a layer, this only performs a reshape (and has no training
        // parameters).
        tf.layers.flatten({inputShape: [7, 7, 256]}),
        // Layer 1
        tf.layers.dense({
          units: units,
          activation: 'relu',
          kernelInitializer: 'varianceScaling',
          useBias: true
        }),
        // Layer 2. The number of units of the last layer should correspond
        // to the number of classes we want to predict.
        tf.layers.dense({
          units: this.NUM_CLASSES,
          kernelInitializer: 'varianceScaling',
          useBias: false,
          activation: 'softmax'
        })
      ]
    });
  }

  async train(dataset, learnRate = 0.0001, defaultBatchSize = 0.4, epochs = 20) {
    this.loading = true;
    if (dataset.xs == null) {
      throw new Error('Add some examples before training!');
    }

    // Creates the optimizers which drives training of the this.model.
    const optimizer = tf.train.adam(learnRate);
    // We use categoricalCrossentropy which is the loss function we use for
    // categorical classification which measures the error between our predicted
    // probability distribution over classes (probability that an input is of each
    // class), versus the label (100% probability in the true class)>
    this.model.compile({optimizer: optimizer, loss: 'categoricalCrossentropy'});

    // We parameterize batch size as a fraction of the entire dataset because the
    // number of examples that are collected depends on how many examples the user
    // collects. This allows us to have a flexible batch size.
    const batchSize =
      Math.floor(dataset.xs.shape[0] * defaultBatchSize);

    if (!(batchSize > 0)) {
      throw new Error(
        `Batch size is 0 or NaN. Please choose a non-zero fraction.`);
    }

    // Train the model! this.model.fit() will shuffle xs & ys so we don't have to.
    this.model.fit(dataset.xs, dataset.ys, {
      batchSize,
      epochs: epochs,
      callbacks: {
        onBatchEnd: async (batch, logs) => {
          console.log('Loss: ' + logs.loss.toFixed(5));
          await tf.nextFrame();
          this.loading = false;
        }
      }
    });
  }

  async predict(webcam, mobilenet) {
    this.loading = true;
    while (this.isPredicting) {
      const predictedClass = tf.tidy(() => {
        // Capture the frame from the webcam.
        const img = webcam.capture();

        // Make a prediction through mobilenet, getting the internal activation of
        // the mobilenet model.
        const activation = mobilenet.predict(img);

        // Make a prediction through our newly-trained model using the activation
        // from mobilenet as input.
        const predictions = this.model.predict(activation);

        // Returns the index with the maximum probability. This number corresponds
        // to the class the model thinks is the most probable given the input.
        return predictions.as1D().argMax();
      });

      this.prediction = (await predictedClass.data())[0];
      // ui.predictClass(classId);
      await tf.nextFrame();
      this.loading = false;
    }
    // ui.donePredicting();
  }

}
