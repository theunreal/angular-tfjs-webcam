import {AfterViewInit, Component, ElementRef, OnInit, ViewChild} from '@angular/core';
import * as tf from '@tensorflow/tfjs';
import {ControllerDataset} from '../assets/controller_dataset';
import {Webcam} from '../assets/webcam';
import {ModelService} from './model.service';
declare const MediaRecorder;
import {Observable} from 'rxjs/Observable';
import 'rxjs/add/observable/fromEvent';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, AfterViewInit {

  selectedLabel;
  mediaRecorder;
  STATE = '';

  @ViewChild('webcamElement') webcamElement: ElementRef;
  webcam: Webcam;

  // The dataset object where we will store activations.
  controllerDataset;

  mobilenet;

  constructor(public modelService: ModelService) {
  }

  ngOnInit() {
    navigator.mediaDevices.getUserMedia({audio: true})
      .then((stream) => {
        this.mediaRecorder = new MediaRecorder(stream);
      });
  }

  async ngAfterViewInit() {
    // A webcam class that generates Tensors from the images from the webcam.
    this.webcam = new Webcam(this.webcamElement.nativeElement);
    this.mobilenet = await this.modelService.loadMobilenet();

    await this.webcam.setup();

    tf.tidy(() => {
      const prediction = this.mobilenet.predict(this.webcam.capture());
      console.log(prediction);
    });
  }

  record() {
      if (this.modelService.labels.length && this.selectedLabel) {
        this.STATE = 'RECORDING';
          if (!this.controllerDataset) {
            this.modelService.modelInit();
            this.controllerDataset = new ControllerDataset(this.modelService.NUM_CLASSES);
          }
          this.modelService.nextFrame().then(() => {
              tf.tidy(() => {
                const img = this.webcam.capture();
                console.log('Added a new example to label: ' + this.selectedLabel.name);
                this.controllerDataset.addExample(this.mobilenet.predict(img), this.selectedLabel.id);
                this.modelService.nextFrame();
              });
          });
     }
  }

  stopRecord() {
    this.STATE = '';
  }

  recordFromURL(imageURL: string) {
    if (!this.controllerDataset) {
      this.modelService.modelInit();
      this.controllerDataset = new ControllerDataset(this.modelService.NUM_CLASSES);
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.addEventListener('load', (image: any) => {
      const theImage = image.path[0];
      theImage.width = 224;
      theImage.height = 224;
      const wc = new Webcam(theImage);
      this.modelService.nextFrame().then(() => {
        const capture = wc.capture();
        console.log(capture);
        this.controllerDataset.addExample(this.mobilenet.predict(capture), this.selectedLabel.id);
        this.modelService.nextFrame();
      });
      });
    img.src = imageURL;

  }

  async train() {
      this.STATE = 'training';
      await this.modelService.nextFrame();
      await this.modelService.nextFrame();
      this.modelService.isPredicting = false;
      this.modelService.train(this.controllerDataset);
  }

  predict() {
    if (!this.modelService.isPredicting) {
      this.modelService.isPredicting = true;
      this.modelService.predict(this.webcam, this.mobilenet);
    } else {
      this.modelService.isPredicting = false;
    }
  }

  addLabel(label) {
    this.modelService.labels.push({
      id: this.modelService.labels.length,
      name: label
    });
  }


}
